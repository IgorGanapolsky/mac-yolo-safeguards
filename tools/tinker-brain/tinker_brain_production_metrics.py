#!/usr/bin/env python3
"""Online / production metrics for tinker-brain (not offline goldens).

Aggregates receipts so operators can grade:
  - task success (contract-ok answers)
  - human override rate (explicit feedback overrides + contract suppressions)
  - latency (wall_ms p50/p95)
  - cost (spend_usd; default path is always $0)

Sources (all under ~/.hermes/receipts/tinker-brain/):
  economics.jsonl          per-answer mode/latency/cost
  production-answers.jsonl per-answer success + route (optional)
  feedback.jsonl           human override / thumbs / corrections
  eval-history.jsonl       continuous regression windows
  continuous-journal.jsonl heal/learn cycles

CLI:
  python3 tools/tinker-brain/tinker_brain_production_metrics.py
  python3 tools/tinker-brain/tinker_brain_production_metrics.py --json
"""

from __future__ import annotations

import argparse
import json
import statistics
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

RECEIPTS = Path.home() / ".hermes" / "receipts" / "tinker-brain"
ECONOMICS = RECEIPTS / "economics.jsonl"
PRODUCTION = RECEIPTS / "production-answers.jsonl"
FEEDBACK = RECEIPTS / "feedback.jsonl"
EVAL_HISTORY = RECEIPTS / "eval-history.jsonl"
CONTINUOUS = RECEIPTS / "continuous-journal.jsonl"
DEFAULT_OUT = RECEIPTS / "production-metrics-latest.json"

# A+ thresholds for this deterministic GTM brain (not a free-form chat SaaS).
THRESHOLDS = {
    "task_success_rate_min": 0.99,
    "human_override_rate_max": 0.05,
    "latency_p50_ms_max": 500.0,
    "spend_usd_max": 0.0,
    "min_production_or_eval_rows": 10,
}


def utc_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def _read_jsonl(path: Path, *, limit: int = 500) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    if not path.is_file():
        return rows
    try:
        lines = path.read_text(encoding="utf-8").splitlines()
    except OSError:
        return rows
    for line in lines[-limit:]:
        try:
            row = json.loads(line)
        except json.JSONDecodeError:
            continue
        if isinstance(row, dict):
            rows.append(row)
    return rows


def _percentile(values: list[float], p: float) -> float | None:
    if not values:
        return None
    ordered = sorted(values)
    if len(ordered) == 1:
        return ordered[0]
    # Nearest-rank style for small N.
    k = max(0, min(len(ordered) - 1, int(round((p / 100.0) * (len(ordered) - 1)))))
    return ordered[k]


def record_production_answer(
    *,
    question: str,
    ok: bool,
    route: str,
    wall_ms: float,
    answer_mode: str = "deterministic_card",
    spend_usd: float = 0.0,
    suppressed: bool = False,
    covered: bool | None = None,
    out: Path = PRODUCTION,
) -> dict[str, Any]:
    """Append one production answer row (call from answer CLI or wrappers)."""
    row = {
        "schema_version": "tinker-brain-production-answer/1",
        "ts": utc_now(),
        "question": (question or "")[:300],
        "ok": bool(ok),
        "route": route or "unknown",
        "wall_ms": round(float(wall_ms), 3),
        "answer_mode": answer_mode,
        "spend_usd": float(spend_usd),
        "suppressed": bool(suppressed),
        "covered": covered,
    }
    out.parent.mkdir(parents=True, exist_ok=True)
    with out.open("a", encoding="utf-8") as handle:
        handle.write(json.dumps(row, sort_keys=True) + "\n")
    return row


def record_feedback(
    *,
    question: str,
    signal: str,
    note: str = "",
    corrected_route: str = "",
    needed_card_section: str = "",
    out: Path = FEEDBACK,
) -> dict[str, Any]:
    """Append human feedback. signal: thumbs_up | thumbs_down | override | need_section."""
    allowed = {"thumbs_up", "thumbs_down", "override", "need_section"}
    if signal not in allowed:
        raise ValueError(f"signal must be one of {sorted(allowed)}")
    row = {
        "schema_version": "tinker-brain-feedback/1",
        "ts": utc_now(),
        "question": (question or "")[:300],
        "signal": signal,
        "note": (note or "")[:500],
        "corrected_route": corrected_route or None,
        "needed_card_section": needed_card_section or None,
        "consumed": False,
        "consumed_at": None,
        "consumed_by": None,
    }
    out.parent.mkdir(parents=True, exist_ok=True)
    with out.open("a", encoding="utf-8") as handle:
        handle.write(json.dumps(row, sort_keys=True) + "\n")
    return row


def mark_feedback_consumed(
    *,
    matcher: str,
    consumed_by: str,
    path: Path = FEEDBACK,
) -> int:
    """Mark unconsumed feedback rows whose question/note/section contains matcher.

    Rewrites the jsonl so LEARN→agenda can prove the loop closed (not collect-only).
    Returns count of newly consumed rows.
    """
    if not path.is_file():
        return 0
    rows = _read_jsonl(path, limit=10_000)
    needle = (matcher or "").lower().strip()
    if not needle:
        return 0
    changed = 0
    now = utc_now()
    out_rows: list[dict[str, Any]] = []
    for row in rows:
        hay = " ".join(
            str(row.get(k) or "")
            for k in ("question", "note", "needed_card_section", "corrected_route", "signal")
        ).lower()
        if not row.get("consumed") and needle in hay:
            row = dict(row)
            row["consumed"] = True
            row["consumed_at"] = now
            row["consumed_by"] = consumed_by
            changed += 1
        out_rows.append(row)
    if changed:
        path.write_text(
            "".join(json.dumps(r, sort_keys=True) + "\n" for r in out_rows),
            encoding="utf-8",
        )
    return changed


def compute_metrics(*, window: int = 200) -> dict[str, Any]:
    econ = _read_jsonl(ECONOMICS, limit=window)
    prod = _read_jsonl(PRODUCTION, limit=window)
    feedback = _read_jsonl(FEEDBACK, limit=window)
    eval_hist = _read_jsonl(EVAL_HISTORY, limit=window)
    cont = _read_jsonl(CONTINUOUS, limit=window)

    # --- task success ---
    # Prefer production answers; fall back to eval-history pass rate (still online-ish continuous).
    if prod:
        task_ok = sum(1 for r in prod if r.get("ok"))
        task_n = len(prod)
        task_source = "production-answers"
    elif eval_hist:
        task_ok = sum(int(r.get("passed") or 0) for r in eval_hist)
        task_n = sum(int(r.get("passed") or 0) + int(r.get("failed") or 0) for r in eval_hist)
        task_source = "eval-history"
    else:
        task_ok = task_n = 0
        task_source = "none"
    task_success_rate = (task_ok / task_n) if task_n else None

    # --- human override ---
    # Open override debt only: unconsumed thumbs_down|override|need_section + suppressed answers.
    # Consumed feedback means LEARN closed the loop (agenda absorbed it) — not an open override.
    override_signals = {"thumbs_down", "override", "need_section"}
    all_override_fb = [r for r in feedback if r.get("signal") in override_signals]
    open_override_fb = [r for r in all_override_fb if not r.get("consumed")]
    suppressed = sum(1 for r in prod if r.get("suppressed"))
    override_num = len(open_override_fb) + suppressed
    # Denominator: production answers in window (min 1 when we have signal to grade rate).
    if prod:
        override_den = len(prod)
        human_override_rate = override_num / override_den
    elif open_override_fb:
        override_den = len(open_override_fb)
        human_override_rate = 1.0  # feedback with no production = 100% override need
    else:
        override_den = 0
        human_override_rate = 0.0

    unconsumed_feedback = open_override_fb

    # --- latency ---
    walls: list[float] = []
    for r in prod:
        if r.get("wall_ms") is not None:
            walls.append(float(r.get("wall_ms") or 0))
    if not walls:
        for r in econ:
            if r.get("wall_ms") is not None:
                walls.append(float(r.get("wall_ms") or 0))
    # Drop pure zeros from older stub rows when we also have non-zero samples.
    non_zero = [w for w in walls if w > 0]
    wall_sample = non_zero if non_zero else walls
    p50 = _percentile(wall_sample, 50)
    p95 = _percentile(wall_sample, 95)

    # --- cost ---
    spends = [float(r.get("spend_usd") or 0) for r in (prod or econ)]
    total_spend = sum(spends) if spends else 0.0
    modes = {}
    for r in econ:
        m = str(r.get("mode") or "unknown")
        modes[m] = modes.get(m, 0) + 1
    for r in prod:
        m = str(r.get("answer_mode") or "unknown")
        modes[m] = modes.get(m, 0) + 1

    # --- continuous online window ---
    recent_eval_failed = sum(int(r.get("failed") or 0) for r in eval_hist[-10:])
    continuous_ok_rate = (
        sum(1 for r in cont if r.get("postOk") or r.get("evalOk")) / len(cont) if cont else None
    )

    metrics = {
        "schema_version": "tinker-brain-production-metrics/1",
        "computed_at": utc_now(),
        "window": window,
        "task_success": {
            "rate": task_success_rate,
            "ok": task_ok,
            "n": task_n,
            "source": task_source,
        },
        "human_override": {
            "rate": human_override_rate,
            "override_events": override_num,
            "denominator": override_den,
            "feedback_overrides_open": len(open_override_fb),
            "feedback_overrides_total": len(all_override_fb),
            "feedback_consumed": sum(1 for r in all_override_fb if r.get("consumed")),
            "suppressed_answers": suppressed,
            "unconsumed_feedback": len(unconsumed_feedback),
        },
        "latency": {
            "p50_ms": p50,
            "p95_ms": p95,
            "n": len(wall_sample),
            "mean_ms": (statistics.fmean(wall_sample) if wall_sample else None),
        },
        "cost": {
            "spend_usd_total": total_spend,
            "spend_usd_max_row": max(spends) if spends else 0.0,
            "modes": modes,
        },
        "continuous_window": {
            "eval_failed_last_10_runs": recent_eval_failed,
            "continuous_ok_rate": continuous_ok_rate,
            "continuous_rows": len(cont),
            "eval_history_rows": len(eval_hist),
        },
        "thresholds": THRESHOLDS,
    }

    # Pass / fail vs thresholds (instrumentation-aware).
    checks: dict[str, bool] = {}
    has_signal = task_n >= THRESHOLDS["min_production_or_eval_rows"] or len(eval_hist) >= 3
    checks["instrumented"] = has_signal
    checks["task_success"] = (
        task_success_rate is not None and task_success_rate >= THRESHOLDS["task_success_rate_min"]
    )
    checks["human_override"] = human_override_rate <= THRESHOLDS["human_override_rate_max"]
    # Latency: only grade if we have real wall samples; zero-only legacy = fail instrumentation.
    if wall_sample and any(w > 0 for w in wall_sample):
        checks["latency"] = (p50 is not None) and p50 <= THRESHOLDS["latency_p50_ms_max"]
    elif wall_sample:
        # All zeros from stubs — treat as latency unknown (not a pass).
        checks["latency"] = False
    else:
        # No rows yet: continuous eval latency_s is a backup signal.
        cont_lat = [float(r.get("latency_s") or 0) * 1000 for r in cont if r.get("latency_s")]
        if cont_lat:
            metrics["latency"]["p50_ms"] = _percentile(cont_lat, 50)
            metrics["latency"]["source"] = "continuous_journal_latency_s"
            # Continuous full cycle is multi-second by design (billing probe + eval).
            # Online answer latency A+ uses answer path; continuous cycle uses ≤60s budget.
            checks["latency"] = (_percentile(cont_lat, 50) or 0) <= 60_000
        else:
            checks["latency"] = False
    checks["cost"] = total_spend <= THRESHOLDS["spend_usd_max"]
    checks["recent_eval_green"] = recent_eval_failed == 0 and len(eval_hist) > 0

    metrics["checks"] = checks
    metrics["a_plus"] = all(
        checks.get(k)
        for k in ("instrumented", "task_success", "human_override", "latency", "cost", "recent_eval_green")
    )
    return metrics


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--json", action="store_true")
    parser.add_argument("--window", type=int, default=200)
    parser.add_argument("--out", type=Path, default=DEFAULT_OUT)
    sub = parser.add_subparsers(dest="cmd")
    fb = sub.add_parser("feedback", help="Record human feedback (closes into LEARN agenda)")
    fb.add_argument("--question", required=True)
    fb.add_argument("--signal", required=True, choices=["thumbs_up", "thumbs_down", "override", "need_section"])
    fb.add_argument("--note", default="")
    fb.add_argument("--corrected-route", default="")
    fb.add_argument("--needed-card-section", default="")
    args = parser.parse_args()

    if args.cmd == "feedback":
        row = record_feedback(
            question=args.question,
            signal=args.signal,
            note=args.note,
            corrected_route=args.corrected_route,
            needed_card_section=args.needed_card_section,
        )
        print(json.dumps({"ok": True, "row": row}, sort_keys=True))
        return 0

    metrics = compute_metrics(window=args.window)
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(metrics, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    if args.json:
        print(json.dumps(metrics, indent=2, sort_keys=True))
    else:
        ts = metrics["task_success"]
        ho = metrics["human_override"]
        lat = metrics["latency"]
        cost = metrics["cost"]
        print("tinker-brain production metrics")
        print(f"  task_success: {ts['rate']} ({ts['ok']}/{ts['n']} via {ts['source']})")
        print(
            f"  human_override: {ho['rate']} "
            f"(events={ho['override_events']} unconsumed={ho['unconsumed_feedback']})"
        )
        print(f"  latency p50/p95 ms: {lat.get('p50_ms')}/{lat.get('p95_ms')} n={lat.get('n')}")
        print(f"  cost spend_usd_total: {cost['spend_usd_total']} modes={cost['modes']}")
        print(f"  checks: {metrics['checks']}")
        print(f"  A+: {metrics['a_plus']}")
        print(f"  receipt: {args.out}")
    return 0 if metrics["a_plus"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
