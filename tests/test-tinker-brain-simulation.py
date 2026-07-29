#!/usr/bin/env python3
"""Contract tests for deterministic Tinker-brain state exploration."""

from __future__ import annotations

import importlib.util
from pathlib import Path
import tempfile
import unittest


ROOT = Path(__file__).resolve().parents[1]
MODULE_PATH = ROOT / "tools" / "tinker-brain" / "tinker_brain_simulation.py"
SPEC = importlib.util.spec_from_file_location("tinker_brain_simulation", MODULE_PATH)
assert SPEC and SPEC.loader
simulation = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(simulation)


class SimulationCase(unittest.TestCase):
    def test_same_seed_replays_the_same_semantic_history(self) -> None:
        commands = simulation.build_commands(seed=41, steps=20)
        first = simulation.run_once(41, commands)
        second = simulation.run_once(41, commands)
        self.assertTrue(simulation.same_semantic_run(first, second))
        self.assertEqual(first["trace_digest"], second["trace_digest"])
        self.assertEqual(first["final_state_digest"], second["final_state_digest"])

    def test_faults_preserve_active_generation_and_leave_no_failed_chunks(self) -> None:
        with tempfile.TemporaryDirectory(prefix="tinker-sim-faults-") as directory:
            runner = simulation.ScenarioRunner(7, Path(directory))
            try:
                initial = runner.index.active_generation()
                for operation in (
                    "parse_failure",
                    "partial_reindex_failure",
                    "embedding_failure",
                    "validator_failure",
                ):
                    runner.execute(
                        {"op": operation, "slot": 0, "revision": 1, "domain": "retrieval"}
                    )
                    self.assertEqual(runner.index.active_generation(), initial)
                self.assertEqual(runner.covered_faults, simulation.REQUIRED_FAULTS)
                failed_chunks = runner.index.connection.execute(
                    """
                    SELECT COUNT(*) AS count FROM chunks
                    WHERE generation_id IN (
                      SELECT generation_id FROM generations WHERE status='failed'
                    )
                    """
                ).fetchone()["count"]
                self.assertEqual(failed_chunks, 0)
            finally:
                runner.close()

    def test_metadata_filter_probe_cannot_leak_another_tenant(self) -> None:
        with tempfile.TemporaryDirectory(prefix="tinker-sim-filter-") as directory:
            runner = simulation.ScenarioRunner(9, Path(directory))
            try:
                transition = runner.execute(
                    {"op": "filter_probe", "slot": 0, "revision": 1, "domain": "revenue"}
                )
                self.assertGreater(transition["outcome"]["results"], 0)
                self.assertEqual(transition["outcome"]["leaked"], 0)
            finally:
                runner.close()

    def test_minimizer_reduces_to_the_causal_counterexample(self) -> None:
        trace = [{"op": name} for name in ("noise-a", "arm", "noise-b", "trigger", "noise-c")]

        def fails(candidate):
            operations = {row["op"] for row in candidate}
            return {"arm", "trigger"}.issubset(operations)

        minimized = simulation.minimize_failing_trace(trace, fails)
        self.assertEqual({row["op"] for row in minimized}, {"arm", "trigger"})
        self.assertEqual(len(minimized), 2)

    def test_unexpected_failure_becomes_a_replayable_minimal_receipt(self) -> None:
        original = simulation.run_once

        def fail_on_trigger(seed, commands):
            del seed
            if any(row["op"] == "validator_failure" for row in commands):
                raise RuntimeError("synthetic crash")
            return original(0, commands)

        simulation.run_once = fail_on_trigger
        try:
            report = simulation.simulate(seeds=1, steps=13, runtime_budget_ms=5_000)
        finally:
            simulation.run_once = original
        self.assertFalse(report["ok"])
        self.assertEqual(report["summary"]["invariant_failures"], 1)
        failure = report["failures"][0]
        self.assertEqual(failure["invariant"], "unexpected_RuntimeError")
        self.assertEqual(len(failure["minimal_commands"]), 1)
        self.assertEqual(failure["minimal_commands"][0]["op"], "validator_failure")
        self.assertIn("--seed 0", failure["replay_command"])

    def test_ci_simulation_meets_coverage_replay_and_action_kpis(self) -> None:
        report = simulation.simulate(seeds=3, steps=18, runtime_budget_ms=5_000)
        self.assertTrue(report["ok"], report)
        self.assertEqual(report["summary"]["invariant_failures"], 0)
        self.assertEqual(report["summary"]["replay_mismatches"], 0)
        self.assertEqual(report["summary"]["state_transition_coverage"], 1.0)
        self.assertEqual(report["summary"]["fault_coverage"], 1.0)
        self.assertEqual(
            {row["name"] for row in report["decision_kpis"]},
            {
                "invariant_failures",
                "replay_mismatches",
                "state_transition_coverage",
                "fault_coverage",
                "runtime_budget_ms",
                "seed_count",
            },
        )
        self.assertTrue(all(row["question"] and row["playbook"] for row in report["decision_kpis"]))


if __name__ == "__main__":
    unittest.main(verbosity=2)
