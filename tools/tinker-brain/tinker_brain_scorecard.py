#!/usr/bin/env python3
"""Compute honest SYSTEM_SCORES from live receipts — measured, never invented.

Replaces the exporter's static ``not_scored`` (and the retired skool-era
numbers) with scores derived from evidence that exists on this machine:

  EVAL          eval-latest.json pass ratio, capped hard when the verifier
                fuzzer finds contract escapes (a gameable verifier caps trust
                in every eval that relies on it)
  DS            observability pipeline: traces, fingerprints, miner receipt —
                present, fresh, parseable
  RAG           semantic index health: watcher running, corpus size, live
                probe search through grepai
  ML            learning readiness: external paid labels (fail-closed 0
                without a revenue receipt) plus FAIL→PASS SFT dataset size —
                honest ceiling of 40 until real labels exist
  MONETIZATION  verified external revenue receipt only
  OVERALL       mean of the five

Every dimension degrades to 0 with a recorded reason instead of raising, so
the exporter can call ``compute()`` inline on every snapshot and stay
fail-closed. Receipt: ~/.hermes/receipts/tinker-brain/scorecard-latest.json.
"""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

sys.path.insert(0, str(Path(__file__).resolve().parent))

RECEIPTS_DIR = Path.home() / ".hermes" / "receipts" / "tinker-brain"
REVENUE_RECEIPT = RECEIPTS_DIR / "revenue-receipt.json"
FAILPASS_DATASET = RECEIPTS_DIR / "failpass-pairs.jsonl"
INDEX_CLONE = Path.home() / ".hermes" / "semantic-index" / "mac-yolo-safeguards"
FRESH_EVAL_S = 7 * 86400
FRESH_OBS_S = 7 * 86400
PROBE_QUERY = "Leash tool approval flow"
PROBE_TIMEOUT_S = 30

_GRADES = (
    (97, "A+"), (93, "A"), (90, "A-"), (87, "B+"), (83, "B"), (80, "B-"),
    (77, "C+"), (73, "C"), (70, "C-"), (67, "D+"), (63, "D"), (60, "D-"),
)


def grade(score: int) -> str:
    for floor, letter in _GRADES:
        if score >= floor:
            return letter
    return "F"


def _load_json(path: Path) -> dict[str, Any] | None:
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        return data if isinstance(data, dict) else None
    except (OSError, json.JSONDecodeError):
        return None


def _fresh(path: Path, max_age_s: int) -> bool:
    try:
        return (time.time() - path.stat().st_mtime) <= max_age_s
    except OSError:
        return False


def _jsonl_rows(path: Path) -> int:
    try:
        return sum(1 for line in path.read_text(encoding="utf-8").splitlines() if line.strip())
    except OSError:
        return 0


def gather_inputs() -> dict[str, Any]:
    """Collect raw evidence. Each probe fails soft into a recorded absence."""
    inputs: dict[str, Any] = {}

    ev = _load_json(RECEIPTS_DIR / "eval-latest.json")
    inputs["eval_passed"] = int(ev.get("passed", 0)) if ev else 0
    inputs["eval_failed"] = int(ev.get("failed", 0)) if ev else 0
    inputs["eval_fresh"] = _fresh(RECEIPTS_DIR / "eval-latest.json", FRESH_EVAL_S)

    try:
        from tinker_brain_verifier_fuzz import run_fuzz

        fuzz = run_fuzz()
        inputs["fuzz_checked"] = fuzz["checked"]
        inputs["fuzz_escapes"] = len(fuzz["escapes"])
    except Exception as exc:  # fuzzer unavailable == unverified verifier
        inputs["fuzz_checked"] = 0
        inputs["fuzz_escapes"] = -1
        inputs["fuzz_error"] = str(exc)[:120]

    inputs["traces_fresh"] = _fresh(RECEIPTS_DIR / "traces.jsonl", FRESH_OBS_S)
    inputs["fingerprints_fresh"] = _fresh(RECEIPTS_DIR / "fingerprints.jsonl", FRESH_OBS_S)
    inputs["miner_receipt"] = (RECEIPTS_DIR / "miner-latest.json").is_file()

    inputs["index_files"] = 0
    inputs["watcher_running"] = False
    inputs["probe_hit"] = False
    try:
        status = subprocess.run(
            ["grepai", "status"], cwd=INDEX_CLONE, capture_output=True,
            text=True, timeout=PROBE_TIMEOUT_S,
        ).stdout
        for line in status.splitlines():
            if line.startswith("Files indexed:"):
                inputs["index_files"] = int(line.split(":")[1].strip() or 0)
            if line.startswith("Watcher:") and "running" in line:
                inputs["watcher_running"] = True
        probe = subprocess.run(
            ["grepai", "search", PROBE_QUERY], cwd=INDEX_CLONE, capture_output=True,
            text=True, timeout=PROBE_TIMEOUT_S,
        )
        inputs["probe_hit"] = probe.returncode == 0 and "Result 1" in probe.stdout
    except (OSError, subprocess.SubprocessError, ValueError) as exc:
        inputs["rag_error"] = str(exc)[:120]

    revenue = _load_json(REVENUE_RECEIPT)
    inputs["external_cents"] = (
        int(revenue.get("external_net_cents", 0)) if revenue and revenue.get("verified") else 0
    )
    inputs["paid_label_count"] = (
        int(revenue.get("paid_label_count", 0)) if revenue and revenue.get("verified") else 0
    )
    inputs["failpass_pairs"] = _jsonl_rows(FAILPASS_DATASET)
    return inputs


def compute_scores(inputs: dict[str, Any]) -> dict[str, Any]:
    """Pure scoring over gathered evidence — unit-testable, no I/O."""
    dims: dict[str, dict[str, Any]] = {}

    total = inputs["eval_passed"] + inputs["eval_failed"]
    if total and inputs["eval_fresh"]:
        eval_score = round(100 * inputs["eval_passed"] / total)
        if inputs["fuzz_escapes"] != 0:
            eval_score = min(eval_score, 50)  # gameable/unverified verifier caps eval trust
    else:
        eval_score = 0
    dims["EVAL"] = {
        "score": eval_score,
        "evidence": (
            f"evals {inputs['eval_passed']}/{total} fresh={inputs['eval_fresh']}; "
            f"fuzzer escapes={inputs['fuzz_escapes']}/{inputs['fuzz_checked']}"
        ),
    }

    ds = (40 if inputs["traces_fresh"] else 0) \
        + (30 if inputs["fingerprints_fresh"] else 0) \
        + (30 if inputs["miner_receipt"] else 0)
    dims["DS"] = {
        "score": ds,
        "evidence": (
            f"traces_fresh={inputs['traces_fresh']} fingerprints_fresh={inputs['fingerprints_fresh']} "
            f"miner_receipt={inputs['miner_receipt']}"
        ),
    }

    rag = (30 if inputs["watcher_running"] else 0) \
        + (30 if inputs["index_files"] >= 1500 else 0) \
        + (40 if inputs["probe_hit"] else 0)
    dims["RAG"] = {
        "score": rag,
        "evidence": (
            f"watcher={inputs['watcher_running']} files={inputs['index_files']} "
            f"probe_hit={inputs['probe_hit']}" + (
                f" error={inputs['rag_error']}" if "rag_error" in inputs else ""
            )
        ),
    }

    if inputs["paid_label_count"] > 0:
        ml = min(100, 40 + inputs["paid_label_count"])
    else:
        ml = min(40, (20 if inputs["failpass_pairs"] >= 25 else 10 if inputs["failpass_pairs"] else 0))
    dims["ML"] = {
        "score": ml,
        "evidence": (
            f"paid_labels={inputs['paid_label_count']} failpass_pairs={inputs['failpass_pairs']}; "
            "ceiling 40 until external paid labels exist (fail-closed)"
        ),
    }

    monetization = min(100, inputs["external_cents"] // 100)
    dims["MONETIZATION"] = {
        "score": monetization,
        "evidence": f"verified external cents={inputs['external_cents']} (absent receipt == 0)",
    }

    overall = round(sum(d["score"] for d in dims.values()) / len(dims))
    for d in dims.values():
        d["grade"] = grade(d["score"])

    line = "; ".join(
        f"{name} {dims[name]['score']}/100 ({dims[name]['grade']})"
        for name in ("DS", "ML", "RAG", "EVAL")
    ) + f"; OVERALL {overall}/100 ({grade(overall)}); MONETIZATION {monetization}/100"
    return {
        "schema_version": "tinker-brain-scorecard/1",
        "dimensions": dims,
        "overall": {"score": overall, "grade": grade(overall)},
        "system_scores_line": line,
    }


def compute(write_receipt: bool = True) -> dict[str, Any]:
    report = compute_scores(gather_inputs())
    report["computed_at"] = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    if write_receipt:
        try:
            RECEIPTS_DIR.mkdir(parents=True, exist_ok=True)
            (RECEIPTS_DIR / "scorecard-latest.json").write_text(
                json.dumps(report, indent=2, sort_keys=True) + "\n", encoding="utf-8"
            )
        except OSError:
            pass
    return report


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--no-receipt", action="store_true")
    args = parser.parse_args()
    report = compute(write_receipt=not args.no_receipt)
    print(json.dumps(report, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
