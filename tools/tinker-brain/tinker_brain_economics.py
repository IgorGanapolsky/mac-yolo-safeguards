#!/usr/bin/env python3
"""Per-answer economics receipts for tinker-brain (answer mode, model, latency).

Slim ThumbGate-era port: appends one JSONL row per answer and refreshes a
latest.json summary so "is the model actually answering, and how slowly?" is
readable from receipts (see the chatbot-regression-triage skill). CLI is
wrapper-compatible: --out --mode --wall-ms [--model] [--contract].
"""

from __future__ import annotations

import argparse
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

RECEIPTS_DIR = Path.home() / ".hermes" / "receipts" / "tinker-brain"
DEFAULT_OUT = RECEIPTS_DIR / "economics.json"
VALID_MODES = ("deterministic", "local_model")


def utc_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def record(
    *,
    out: Path,
    mode: str,
    wall_ms: float,
    model: str = "",
    contract_path: Path | None = None,
) -> dict[str, Any]:
    if mode not in VALID_MODES:
        raise ValueError(f"mode must be one of {VALID_MODES}, got {mode!r}")
    contract: dict[str, Any] = {}
    if contract_path and contract_path.is_file():
        try:
            contract = json.loads(contract_path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            contract = {"unreadable": True}
    row = {
        "schema_version": "tinker-brain-economics/2",
        "ts": utc_now(),
        "mode": mode,
        "model": model or None,
        "wall_ms": round(float(wall_ms), 3),
        "spend_usd": 0.0,
        "contract": contract or None,
    }
    out.parent.mkdir(parents=True, exist_ok=True)
    history = out.with_suffix(".jsonl")
    with history.open("a", encoding="utf-8") as handle:
        handle.write(json.dumps(row, sort_keys=True) + "\n")

    rows: list[dict[str, Any]] = []
    for line in history.read_text(encoding="utf-8").splitlines()[-200:]:
        try:
            parsed = json.loads(line)
        except json.JSONDecodeError:
            continue
        if isinstance(parsed, dict):
            rows.append(parsed)
    model_rows = [r for r in rows if r.get("mode") == "local_model"]
    summary = {
        "schema_version": "tinker-brain-economics-summary/2",
        "updated_at": row["ts"],
        "window_rows": len(rows),
        "deterministic_answers": sum(1 for r in rows if r.get("mode") == "deterministic"),
        "local_model_answers": len(model_rows),
        "local_model_p50_wall_ms": (
            sorted(float(r.get("wall_ms") or 0) for r in model_rows)[len(model_rows) // 2]
            if model_rows
            else None
        ),
        "last": row,
        "history": str(history),
    }
    out.write_text(json.dumps(summary, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    return summary


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--out", type=Path, default=DEFAULT_OUT)
    parser.add_argument("--mode", required=True, choices=VALID_MODES)
    parser.add_argument("--wall-ms", type=float, required=True)
    parser.add_argument("--model", default="")
    parser.add_argument("--contract", type=Path, default=None)
    args = parser.parse_args()
    summary = record(
        out=args.out,
        mode=args.mode,
        wall_ms=args.wall_ms,
        model=args.model,
        contract_path=args.contract,
    )
    print(json.dumps({"ok": True, "updated_at": summary["updated_at"]}, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
