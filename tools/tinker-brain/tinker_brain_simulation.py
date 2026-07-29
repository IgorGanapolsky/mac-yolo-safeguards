#!/usr/bin/env python3
"""Deterministic state-machine and fault-injection harness for Tinker-brain.

This is intentionally smaller than a deterministic hypervisor.  It controls the
entropy we own (operation ordering, data, faults, and assertions), records a
portable semantic digest after every transition, and emits the exact seed and
minimal failing trace needed to replay a failure.
"""

from __future__ import annotations

import argparse
from collections import Counter
import hashlib
import importlib.util
import json
from pathlib import Path
import random
import statistics
import tempfile
import time
from typing import Any, Callable, Dict, List, Optional, Sequence


MODULE_PATH = Path(__file__).with_name("tinker_brain_ingestion.py")
SPEC = importlib.util.spec_from_file_location("tinker_brain_ingestion", MODULE_PATH)
assert SPEC and SPEC.loader
ingestion = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(ingestion)


REQUIRED_OPERATIONS = {
    "delete",
    "duplicate",
    "filter_probe",
    "reindex",
    "rollback",
    "search",
    "upsert",
}
REQUIRED_FAULTS = {
    "embedding_failure",
    "parse_failure",
    "partial_reindex_failure",
    "validator_failure",
}

PRIMARY_DECISION_KPIS = (
    "invariant_failures",
    "replay_mismatches",
    "state_transition_coverage",
    "fault_coverage",
    "runtime_budget_ms",
)

KPI_EXPECTED_IMPACTS = {
    "invariant_failures": "Restore invariant_failures to 0 and retain each causal seed as a regression.",
    "replay_mismatches": "Restore replay_mismatches to 0 for identical seeds and command traces.",
    "state_transition_coverage": "Restore required state-transition coverage to 100%.",
    "fault_coverage": "Restore declared fault-injection coverage to 100%.",
    "runtime_budget_ms": "Bring the PR simulation matrix back within its configured runtime budget.",
}
MANDATORY_SEQUENCE = (
    "upsert",
    "reindex",
    "search",
    "parse_failure",
    "partial_reindex_failure",
    "embedding_failure",
    "validator_failure",
    "upsert",
    "duplicate",
    "reindex",
    "filter_probe",
    "delete",
    "rollback",
)
RANDOM_OPERATIONS = (
    "upsert",
    "upsert",
    "delete",
    "duplicate",
    "reindex",
    "reindex",
    "search",
    "filter_probe",
    "rollback",
    "parse_failure",
    "partial_reindex_failure",
    "embedding_failure",
    "validator_failure",
)


class InvariantViolation(AssertionError):
    """A named invariant failure with a stable machine-readable code."""

    def __init__(self, code: str, detail: str) -> None:
        self.code = code
        self.detail = detail
        super().__init__(f"{code}:{detail}")


def failure_identity(exc: Exception) -> tuple[str, str]:
    if isinstance(exc, InvariantViolation):
        return exc.code, exc.detail
    return f"unexpected_{type(exc).__name__}", str(exc)


def stable_hash(value: Any) -> str:
    encoded = json.dumps(value, sort_keys=True, separators=(",", ":")).encode("utf-8")
    return hashlib.sha256(encoded).hexdigest()


def percentile(values: Sequence[float], quantile: float) -> float:
    if not values:
        return 0.0
    ordered = sorted(values)
    if len(ordered) == 1:
        return ordered[0]
    position = (len(ordered) - 1) * quantile
    low = int(position)
    high = min(low + 1, len(ordered) - 1)
    fraction = position - low
    return ordered[low] * (1.0 - fraction) + ordered[high] * fraction


def minimize_failing_trace(
    trace: Sequence[Dict[str, Any]],
    still_fails: Callable[[Sequence[Dict[str, Any]]], bool],
) -> List[Dict[str, Any]]:
    """Delta-debug a trace while preserving the same failure predicate."""

    candidate = list(trace)
    if not candidate or not still_fails(candidate):
        return candidate
    granularity = 2
    while len(candidate) >= 2:
        chunk_size = max(1, (len(candidate) + granularity - 1) // granularity)
        reduced = False
        for start in range(0, len(candidate), chunk_size):
            complement = candidate[:start] + candidate[start + chunk_size :]
            if complement and still_fails(complement):
                candidate = complement
                granularity = max(2, granularity - 1)
                reduced = True
                break
        if reduced:
            continue
        if granularity >= len(candidate):
            break
        granularity = min(len(candidate), granularity * 2)
    return candidate


def build_commands(seed: int, steps: int) -> List[Dict[str, Any]]:
    rng = random.Random(seed)
    commands: List[Dict[str, Any]] = []
    for index in range(max(steps, len(MANDATORY_SEQUENCE))):
        operation = (
            MANDATORY_SEQUENCE[index]
            if index < len(MANDATORY_SEQUENCE)
            else rng.choice(RANDOM_OPERATIONS)
        )
        commands.append(
            {
                "op": operation,
                "slot": rng.randrange(4),
                "revision": rng.randrange(1, 10_000),
                "domain": rng.choice(("revenue", "retrieval")),
            }
        )
    return commands


class ScenarioRunner:
    """Run one semantic history from a clean database."""

    def __init__(self, seed: int, root: Path) -> None:
        self.seed = seed
        self.root = Path(root)
        self.corpus = self.root / "corpus"
        self.corpus.mkdir(parents=True, exist_ok=True)
        self.index = ingestion.TinkerBrainIndex(self.root / "index.sqlite3")
        self.covered_operations: set[str] = set()
        self.covered_faults: set[str] = set()
        self.transitions: List[Dict[str, Any]] = []
        self.ready_generations: List[str] = []
        self._bootstrap()

    def close(self) -> None:
        self.index.close()

    def _bootstrap(self) -> None:
        records = [
            self.index.parse_inline(
                "fixture://domain-revenue",
                "# Revenue guard\nVerified buyer cash requires a provider receipt.",
                "text/markdown",
                metadata={"domain": "revenue", "tenant": "alpha"},
            ),
            self.index.parse_inline(
                "fixture://domain-retrieval",
                "# Retrieval guard\nFailed rebuilds preserve the active generation.",
                "text/markdown",
                metadata={"domain": "retrieval", "tenant": "alpha"},
            ),
            self.index.parse_inline(
                "fixture://other-tenant",
                "# Isolation guard\nThis evidence belongs only to another tenant.",
                "text/markdown",
                metadata={"domain": "revenue", "tenant": "beta"},
            ),
        ]
        self.index.ingest_records(records)
        built = self.index.reindex()
        if not built["ok"]:
            raise RuntimeError(f"bootstrap_reindex_failed:{built}")
        self.ready_generations.append(str(built["generation_id"]))
        self.assert_invariants()

    def _remember_ready_generations(self) -> None:
        # Preserve the scenario's successful-build order. created_at is only
        # second-resolution and generation IDs include wall-clock entropy, so
        # sorting database rows by either makes an identical seed pick a
        # different rollback target.
        live = {
            str(row["generation_id"])
            for row in self.index.connection.execute(
                "SELECT generation_id FROM generations WHERE status IN ('ready','active')"
            ).fetchall()
        }
        self.ready_generations = [
            generation for generation in self.ready_generations if generation in live
        ]

    def semantic_snapshot(self) -> Dict[str, Any]:
        connection = self.index.connection
        sources = [
            {
                "source": Path(str(row["source_uri"])).name,
                "content_hash": row["content_hash"],
                "state": row["state"],
            }
            for row in connection.execute(
                "SELECT source_uri, content_hash, state FROM source_heads ORDER BY source_uri"
            ).fetchall()
        ]
        active = self.index.active_generation()
        chunks = [
            {
                "source": Path(str(row["source_uri"])).name,
                "heading": row["heading_path"],
                "content_hash": ingestion.sha256_text(str(row["content"])),
            }
            for row in connection.execute(
                """
                SELECT source_uri, heading_path, content
                FROM chunks WHERE generation_id=?
                ORDER BY source_uri, heading_path, chunk_id
                """,
                (active,),
            ).fetchall()
        ] if active else []
        generation_counts = {
            str(row["status"]): int(row["count"])
            for row in connection.execute(
                "SELECT status, COUNT(*) AS count FROM generations GROUP BY status ORDER BY status"
            ).fetchall()
        }
        return {
            "sources": sources,
            "chunks": chunks,
            "generation_counts": generation_counts,
            "active_present": active is not None,
        }

    def state_digest(self) -> str:
        return stable_hash(self.semantic_snapshot())

    def assert_invariants(self) -> None:
        connection = self.index.connection
        active = self.index.active_generation()
        active_rows = connection.execute(
            "SELECT generation_id FROM generations WHERE status='active'"
        ).fetchall()
        if active is None:
            if active_rows:
                raise InvariantViolation("active_pointer_missing", f"rows={len(active_rows)}")
        elif len(active_rows) != 1 or str(active_rows[0]["generation_id"]) != active:
            raise InvariantViolation(
                "active_generation_not_unique",
                f"pointer={active} rows={[row['generation_id'] for row in active_rows]}",
            )

        failed_with_chunks = connection.execute(
            """
            SELECT g.generation_id, COUNT(c.chunk_id) AS chunks
            FROM generations g LEFT JOIN chunks c ON c.generation_id=g.generation_id
            WHERE g.status='failed'
            GROUP BY g.generation_id HAVING COUNT(c.chunk_id)>0
            """
        ).fetchall()
        if failed_with_chunks:
            raise InvariantViolation(
                "failed_generation_queryable",
                ",".join(str(row["generation_id"]) for row in failed_with_chunks),
            )

        failed_fts = connection.execute(
            """
            SELECT COUNT(*) AS count FROM chunks_fts
            WHERE generation_id IN (SELECT generation_id FROM generations WHERE status='failed')
            """
        ).fetchone()["count"]
        if failed_fts:
            raise InvariantViolation("failed_generation_in_fts", str(failed_fts))

        broken_heads = connection.execute(
            """
            SELECT h.source_uri FROM source_heads h
            LEFT JOIN documents d ON d.version_id=h.version_id
            WHERE h.state='active'
              AND (d.version_id IS NULL OR d.is_current<>1 OR d.tombstoned<>0)
            """
        ).fetchall()
        if broken_heads:
            raise InvariantViolation(
                "active_head_not_current",
                ",".join(str(row["source_uri"]) for row in broken_heads),
            )

        if active:
            chunk_count = connection.execute(
                "SELECT COUNT(*) AS count FROM chunks WHERE generation_id=?",
                (active,),
            ).fetchone()["count"]
            if chunk_count <= 0:
                raise InvariantViolation("active_generation_empty", active)

    def _upsert(self, command: Dict[str, Any]) -> Dict[str, Any]:
        path = self.corpus / f"doc-{command['slot']}.md"
        path.write_text(
            (
                f"# Slot {command['slot']}\n"
                f"Revision {command['revision']} records {command['domain']} evidence "
                f"for deterministic seed {self.seed}."
            ),
            encoding="utf-8",
        )
        return self.index.sync_root(self.corpus)

    def _delete(self, command: Dict[str, Any]) -> Dict[str, Any]:
        path = self.corpus / f"doc-{command['slot']}.md"
        existed = path.exists()
        if existed:
            path.unlink()
        result = self.index.sync_root(self.corpus)
        result["target_existed"] = existed
        return result

    def _duplicate(self, command: Dict[str, Any]) -> Dict[str, Any]:
        sources = sorted(self.corpus.glob("doc-*.md"))
        target = self.corpus / f"duplicate-{command['slot']}.md"
        content = (
            sources[0].read_text(encoding="utf-8")
            if sources
            else "# Duplicate\nDeterministic duplicate evidence."
        )
        target.write_text(content, encoding="utf-8")
        return self.index.sync_root(self.corpus)

    def _successful_reindex(self) -> Dict[str, Any]:
        result = self.index.reindex()
        if not result["ok"]:
            raise InvariantViolation("expected_reindex_success", str(result.get("error")))
        self.ready_generations.append(str(result["generation_id"]))
        self._remember_ready_generations()
        return {
            "ok": True,
            "documents": result["documents"],
            "chunks": result["chunks"],
            "active_changed": result["previous_generation"] != result["generation_id"],
        }

    def _faulted_reindex(
        self,
        fault: str,
        invoke: Callable[[], Dict[str, Any]],
    ) -> Dict[str, Any]:
        before = self.index.active_generation()
        result = invoke()
        after = self.index.active_generation()
        if result["ok"]:
            raise InvariantViolation("fault_did_not_fire", fault)
        if before != after:
            raise InvariantViolation(
                "failed_reindex_moved_active_pointer",
                f"fault={fault} before={before} after={after}",
            )
        self.covered_faults.add(fault)
        return {
            "ok": False,
            "fault": fault,
            "error": result.get("error"),
            "active_preserved": before == after,
        }

    def _embedding_fault(self) -> Dict[str, Any]:
        original = self.index.embedder.embed

        def fail_embedding(_: str) -> List[float]:
            raise RuntimeError("injected_embedding_failure")

        self.index.embedder.embed = fail_embedding
        try:
            return self._faulted_reindex("embedding_failure", self.index.reindex)
        finally:
            self.index.embedder.embed = original

    def _parse_fault(self) -> Dict[str, Any]:
        before = self.state_digest()
        try:
            self.index.parse_inline(
                "fault://binary",
                "not an image",
                "image/png",
            )
        except ValueError as exc:
            if "inline_binary_not_supported" not in str(exc):
                raise
            self.covered_faults.add("parse_failure")
            if before != self.state_digest():
                raise InvariantViolation("parse_failure_mutated_state", str(exc))
            return {"ok": False, "fault": "parse_failure", "error": str(exc)}
        raise InvariantViolation("fault_did_not_fire", "parse_failure")

    def _search(self, command: Dict[str, Any]) -> Dict[str, Any]:
        before = self.index.active_generation()
        output = self.index.search(
            f"revision {command['revision']} {command['domain']} evidence",
            limit=3,
        )
        if output["generation_id"] != before:
            raise InvariantViolation(
                "search_snapshot_changed",
                f"before={before} search={output['generation_id']}",
            )
        if output["consistency"] != "strong_generation_snapshot":
            raise InvariantViolation("search_not_strong_snapshot", output["consistency"])
        return {
            "generation_present": output["generation_id"] is not None,
            "results": len(output["results"]),
            "candidate_count": output["candidate_count"],
        }

    def _filter_probe(self) -> Dict[str, Any]:
        output = self.index.search(
            "provider receipt evidence",
            limit=10,
            filters={"domain": "revenue", "tenant": "alpha"},
        )
        leaked = [
            row["source_uri"]
            for row in output["results"]
            if row["metadata"].get("domain") != "revenue"
            or row["metadata"].get("tenant") != "alpha"
        ]
        if leaked:
            raise InvariantViolation("metadata_filter_leak", ",".join(leaked))
        if not output["results"]:
            raise InvariantViolation("metadata_filter_false_negative", "revenue/alpha")
        return {"results": len(output["results"]), "leaked": 0}

    def _rollback(self) -> Dict[str, Any]:
        self._remember_ready_generations()
        active = self.index.active_generation()
        candidates = [generation for generation in self.ready_generations if generation != active]
        if not candidates:
            return {"skipped": "no_ready_generation"}
        target = candidates[0]
        result = self.index.rollback(target)
        self._remember_ready_generations()
        return {"ok": result["ok"], "chunks": result["chunks"], "changed": active != target}

    def execute(self, command: Dict[str, Any]) -> Dict[str, Any]:
        operation = str(command["op"])
        started = time.perf_counter()
        if operation == "upsert":
            outcome = self._upsert(command)
            self.covered_operations.add(operation)
        elif operation == "delete":
            outcome = self._delete(command)
            self.covered_operations.add(operation)
        elif operation == "duplicate":
            outcome = self._duplicate(command)
            self.covered_operations.add(operation)
        elif operation == "reindex":
            outcome = self._successful_reindex()
            self.covered_operations.add(operation)
        elif operation == "search":
            outcome = self._search(command)
            self.covered_operations.add(operation)
        elif operation == "filter_probe":
            outcome = self._filter_probe()
            self.covered_operations.add(operation)
        elif operation == "rollback":
            outcome = self._rollback()
            self.covered_operations.add(operation)
        elif operation == "parse_failure":
            outcome = self._parse_fault()
        elif operation == "partial_reindex_failure":
            outcome = self._faulted_reindex(
                "partial_reindex_failure",
                lambda: self.index.reindex(fail_after_chunks=1),
            )
        elif operation == "embedding_failure":
            outcome = self._embedding_fault()
        elif operation == "validator_failure":
            outcome = self._faulted_reindex(
                "validator_failure",
                lambda: self.index.reindex(validator=lambda _generation, _chunks: False),
            )
        else:
            raise ValueError(f"unknown_operation:{operation}")
        self.assert_invariants()
        transition = {
            "command": dict(command),
            "outcome": outcome,
            "state_digest": self.state_digest(),
            "latency_ms": round((time.perf_counter() - started) * 1000, 3),
        }
        self.transitions.append(transition)
        return transition

    def run(self, commands: Sequence[Dict[str, Any]]) -> Dict[str, Any]:
        for command in commands:
            self.execute(command)
        return {
            "seed": self.seed,
            "commands": [dict(command) for command in commands],
            "trace_digest": stable_hash(
                [
                    {
                        "command": row["command"],
                        "outcome": row["outcome"],
                        "state_digest": row["state_digest"],
                    }
                    for row in self.transitions
                ]
            ),
            "final_state_digest": self.state_digest(),
            "covered_operations": sorted(self.covered_operations),
            "covered_faults": sorted(self.covered_faults),
            "operation_counts": dict(
                sorted(Counter(row["command"]["op"] for row in self.transitions).items())
            ),
            "latency_ms": [row["latency_ms"] for row in self.transitions],
        }


def run_once(seed: int, commands: Sequence[Dict[str, Any]]) -> Dict[str, Any]:
    with tempfile.TemporaryDirectory(prefix=f"tinker-sim-{seed}-") as directory:
        runner = ScenarioRunner(seed, Path(directory))
        try:
            return runner.run(commands)
        finally:
            runner.close()


def same_semantic_run(left: Dict[str, Any], right: Dict[str, Any]) -> bool:
    keys = (
        "commands",
        "trace_digest",
        "final_state_digest",
        "covered_operations",
        "covered_faults",
        "operation_counts",
    )
    return all(left[key] == right[key] for key in keys)


def decision_kpis(
    *,
    seeds: int,
    invariant_failures: int,
    replay_mismatches: int,
    operation_coverage: float,
    fault_coverage: float,
    runtime_ms: float,
    runtime_budget_ms: float,
) -> List[Dict[str, Any]]:
    rows = [
        {
            "name": "invariant_failures",
            "question": "Did any reachable history violate a product safety or liveness promise?",
            "value": invariant_failures,
            "threshold": 0,
            "ok": invariant_failures == 0,
            "playbook": "Block merge; replay the recorded seed; fix the minimal counterexample; add the invariant as a permanent regression.",
        },
        {
            "name": "replay_mismatches",
            "question": "Can the same seed reproduce the same semantic history?",
            "value": replay_mismatches,
            "threshold": 0,
            "ok": replay_mismatches == 0,
            "playbook": "Block merge; remove uncontrolled time, randomness, ordering, or external I/O from the harness.",
        },
        {
            "name": "state_transition_coverage",
            "question": "Did the run exercise every supported state-changing and retrieval operation?",
            "value": round(operation_coverage, 4),
            "threshold": 1.0,
            "ok": operation_coverage >= 1.0,
            "playbook": "Add or reweight seeded operations until every required transition is exercised.",
        },
        {
            "name": "fault_coverage",
            "question": "Did the run actually trigger every declared failure class?",
            "value": round(fault_coverage, 4),
            "threshold": 1.0,
            "ok": fault_coverage >= 1.0,
            "playbook": "Add a deterministic injection point and prove the active generation and source state survive it.",
        },
        {
            "name": "runtime_budget_ms",
            "question": "Is adversarial exploration cheap enough to run on every PR?",
            "value": round(runtime_ms, 3),
            "threshold": runtime_budget_ms,
            "ok": runtime_ms <= runtime_budget_ms,
            "playbook": "Keep a small deterministic PR seed set; move additional seed breadth to scheduled CI; profile the slow transition.",
        },
        {
            "name": "seed_count",
            "question": "Did CI explore the configured breadth rather than one curated path?",
            "value": seeds,
            "threshold": seeds,
            "ok": seeds > 0,
            "playbook": "Restore the configured seed matrix and retain failing seeds as permanent regression cases.",
        },
    ]
    return rows


def weekly_decision_review(
    kpis: Sequence[Dict[str, Any]],
    *,
    max_actions: int = 5,
    owner: str = "tinker-brain-maintainer",
) -> Dict[str, Any]:
    """Turn red primary KPIs into a bounded, schedulable action receipt."""
    bounded_limit = max(1, min(5, int(max_actions)))
    primary_by_name = {
        str(row["name"]): row
        for row in kpis
        if str(row["name"]) in PRIMARY_DECISION_KPIS
    }
    primary = [
        primary_by_name[name]
        for name in PRIMARY_DECISION_KPIS
        if name in primary_by_name
    ]
    red = [row for row in primary if not bool(row["ok"])]
    scheduled = red[:bounded_limit]
    actions = [
        {
            "action_id": ingestion.stable_id(
                "act",
                str(row["name"]),
                ingestion.stable_json(row["value"]),
                ingestion.stable_json(row["threshold"]),
            ),
            "kpi": row["name"],
            "question": row["question"],
            "observed": row["value"],
            "threshold": row["threshold"],
            "owner": owner,
            "due": "before_next_weekly_review",
            "expected_impact": KPI_EXPECTED_IMPACTS[str(row["name"])],
            "playbook": row["playbook"],
            "status": "scheduled",
        }
        for row in scheduled
    ]
    return {
        "cadence": "weekly",
        "decision": "intervene" if red else "hold_green_baseline",
        "primary_kpis": [row["name"] for row in primary],
        "red_primary_kpis": len(red),
        "max_actions": bounded_limit,
        "actions": actions,
        "deferred_red_kpis": [row["name"] for row in red[bounded_limit:]],
        "green_decision": (
            "Keep the current seed matrix and thresholds; add a regression only after a real incident."
            if not red
            else None
        ),
    }


def simulate(
    seeds: int = 12,
    steps: int = 24,
    runtime_budget_ms: float = 5_000.0,
) -> Dict[str, Any]:
    started = time.perf_counter()
    failures: List[Dict[str, Any]] = []
    receipts: List[Dict[str, Any]] = []
    covered_operations: set[str] = set()
    covered_faults: set[str] = set()
    replay_mismatches = 0
    transition_latencies: List[float] = []

    for seed in range(seeds):
        commands = build_commands(seed, steps)
        try:
            first = run_once(seed, commands)
            replay = run_once(seed, commands)
            replay_ok = same_semantic_run(first, replay)
            if not replay_ok:
                replay_mismatches += 1
            covered_operations.update(first["covered_operations"])
            covered_faults.update(first["covered_faults"])
            transition_latencies.extend(first["latency_ms"])
            receipts.append(
                {
                    "seed": seed,
                    "steps": len(commands),
                    "trace_digest": first["trace_digest"],
                    "final_state_digest": first["final_state_digest"],
                    "replay_ok": replay_ok,
                    "operation_counts": first["operation_counts"],
                }
            )
        except Exception as exc:
            failure_code, failure_detail = failure_identity(exc)

            def same_failure(candidate: Sequence[Dict[str, Any]]) -> bool:
                try:
                    run_once(seed, candidate)
                except Exception as replay_exc:
                    replay_code, _ = failure_identity(replay_exc)
                    return replay_code == failure_code
                return False

            minimized = minimize_failing_trace(commands, same_failure)
            failures.append(
                {
                    "seed": seed,
                    "invariant": failure_code,
                    "detail": failure_detail,
                    "commands": commands,
                    "minimal_commands": minimized,
                    "replay_command": (
                        "python3 tools/tinker-brain/tinker_brain_simulation.py "
                        f"--seed {seed} --steps {steps}"
                    ),
                }
            )

    runtime_ms = (time.perf_counter() - started) * 1000
    operation_coverage = len(covered_operations.intersection(REQUIRED_OPERATIONS)) / len(REQUIRED_OPERATIONS)
    fault_coverage = len(covered_faults.intersection(REQUIRED_FAULTS)) / len(REQUIRED_FAULTS)
    kpis = decision_kpis(
        seeds=seeds,
        invariant_failures=len(failures),
        replay_mismatches=replay_mismatches,
        operation_coverage=operation_coverage,
        fault_coverage=fault_coverage,
        runtime_ms=runtime_ms,
        runtime_budget_ms=runtime_budget_ms,
    )
    return {
        "ok": all(row["ok"] for row in kpis),
        "config": {
            "seeds": seeds,
            "steps_per_seed": max(steps, len(MANDATORY_SEQUENCE)),
            "runtime_budget_ms": runtime_budget_ms,
        },
        "summary": {
            "seeds_completed": len(receipts),
            "invariant_failures": len(failures),
            "replay_mismatches": replay_mismatches,
            "state_transition_coverage": round(operation_coverage, 4),
            "fault_coverage": round(fault_coverage, 4),
            "runtime_ms": round(runtime_ms, 3),
            "transition_latency_ms": {
                "p50": round(statistics.median(transition_latencies), 3) if transition_latencies else 0.0,
                "p95": round(percentile(transition_latencies, 0.95), 3),
                "max": round(max(transition_latencies), 3) if transition_latencies else 0.0,
            },
        },
        "coverage": {
            "operations": sorted(covered_operations),
            "required_operations": sorted(REQUIRED_OPERATIONS),
            "faults": sorted(covered_faults),
            "required_faults": sorted(REQUIRED_FAULTS),
        },
        "decision_kpis": kpis,
        "weekly_review": weekly_decision_review(kpis),
        "receipts": receipts,
        "failures": failures,
    }


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--seeds", type=int, default=12)
    parser.add_argument("--steps", type=int, default=24)
    parser.add_argument("--seed", type=int)
    parser.add_argument("--runtime-budget-ms", type=float, default=5_000.0)
    parser.add_argument("--out", type=Path)
    return parser


def main(argv: Optional[Sequence[str]] = None) -> int:
    args = build_parser().parse_args(argv)
    if args.seed is not None:
        commands = build_commands(args.seed, args.steps)
        first = run_once(args.seed, commands)
        replay = run_once(args.seed, commands)
        payload: Dict[str, Any] = {
            "ok": same_semantic_run(first, replay),
            "seed": args.seed,
            "steps": len(commands),
            "trace_digest": first["trace_digest"],
            "final_state_digest": first["final_state_digest"],
            "replay_ok": same_semantic_run(first, replay),
            "covered_operations": first["covered_operations"],
            "covered_faults": first["covered_faults"],
            "commands": commands,
        }
    else:
        payload = simulate(
            seeds=args.seeds,
            steps=args.steps,
            runtime_budget_ms=args.runtime_budget_ms,
        )
    rendered = json.dumps(payload, indent=2, sort_keys=True)
    if args.out:
        args.out.parent.mkdir(parents=True, exist_ok=True)
        args.out.write_text(f"{rendered}\n", encoding="utf-8")
    print(rendered)
    return 0 if payload["ok"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
