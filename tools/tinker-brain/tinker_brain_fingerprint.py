#!/usr/bin/env python3
"""Component fingerprint for tinker-brain regression triage.

Answers "the chatbot suddenly got worse — what changed?" mechanically:
each capture records digests for the model, the prompts, the retrieved
documents (ANSWER_CARD / expert card / snapshot), the code, and the tool
surface; `diff` compares two captures and names the changed components.
Pair with tinker_brain_eval.py (reproduce) to assign blame.

  capture [--question "..."]   append fingerprint (and question) to the logs
  diff [--verbose]             compare the two most recent fingerprints
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import sys
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

BRAIN = Path(__file__).resolve().parent
REPO = BRAIN.parents[1]
SNAP_DIR = Path.home() / ".hermes" / "business-brain" / "data-snapshot"
RECEIPTS_DIR = Path.home() / ".hermes" / "receipts" / "tinker-brain"
FINGERPRINTS = RECEIPTS_DIR / "fingerprints.jsonl"
QUESTIONS = RECEIPTS_DIR / "questions.jsonl"
DEFAULT_MODEL = "qwen3-hermes-tinker-toolfix:q4"

COMPONENT_QUESTION = {
    "model": "Q1 model changed",
    "retrieval": "Q2 retrieved documents changed",
    "prompts": "Q3 prompts changed",
    "tools": "Q4 tool APIs / runtime changed",
    "code": "Q7 pipeline code changed",
}


def utc_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def sha256_file(path: Path) -> str:
    try:
        return hashlib.sha256(path.read_bytes()).hexdigest()
    except OSError:
        return "missing"


def _card_field(path: Path, key: str) -> str:
    try:
        for line in path.read_text(encoding="utf-8").splitlines():
            if line.startswith(f"{key}="):
                return line.split("=", 1)[1].strip()
            if line.startswith(f"{key}:"):
                return line.split(":", 1)[1].strip()
    except OSError:
        pass
    return "missing"


def _ollama(path: str, timeout: float = 1.5) -> dict[str, Any]:
    try:
        with urllib.request.urlopen(f"http://127.0.0.1:11434{path}", timeout=timeout) as resp:
            body = json.loads(resp.read().decode("utf-8"))
        return body if isinstance(body, dict) else {}
    except Exception:  # noqa: BLE001 — observability must never break the answer path
        return {}


def capture() -> dict[str, Any]:
    model_tag = os.environ.get("TINKER_BRAIN_MODEL", DEFAULT_MODEL)
    tags = _ollama("/api/tags")
    model_digest = "unreachable"
    if tags:
        model_digest = "not_installed"
        for row in tags.get("models") or []:
            if isinstance(row, dict) and row.get("name") == model_tag:
                model_digest = str(row.get("digest") or "unknown")
                break
    version = _ollama("/api/version")
    return {
        "schema_version": "tinker-brain-fingerprint/1",
        "captured_at": utc_now(),
        "model": {
            "tag": model_tag,
            "digest": model_digest,
            "chat_mode_default": os.environ.get("TINKER_BRAIN_CHAT_MODE", ""),
            "use_ollama": os.environ.get("TINKER_BRAIN_USE_OLLAMA", "0"),
        },
        "prompts": {
            "wrapper_sha256": sha256_file(Path.home() / ".local" / "bin" / "tinker-brain"),
            "structured_answer_sha256": sha256_file(
                Path.home() / ".hermes" / "business-brain" / "tinker_brain_structured_answer.py"
            ),
        },
        "retrieval": {
            "answer_card_sha256": sha256_file(SNAP_DIR / "ANSWER_CARD.txt"),
            "answer_card_as_of": _card_field(SNAP_DIR / "ANSWER_CARD.txt", "AS_OF"),
            "expert_card_sha256": sha256_file(SNAP_DIR / "THUMBGATE_EXPERT_CARD.txt"),
            "expert_card_repo_sha256": sha256_file(
                REPO / "config" / "THUMBGATE_EXPERT_CARD.txt"
            ),
            "expert_card_as_of_research": _card_field(
                REPO / "config" / "THUMBGATE_EXPERT_CARD.txt", "AS_OF_RESEARCH"
            ),
            "snapshot_sha256": sha256_file(SNAP_DIR / "business_snapshot.json"),
        },
        "code": {
            "router_sha256": sha256_file(BRAIN / "tinker_brain_router.py"),
            "answer_sha256": sha256_file(BRAIN / "tinker_brain_answer.py"),
            "contract_sha256": sha256_file(BRAIN / "tinker_response_contract.py"),
            "exporter_sha256": sha256_file(BRAIN / "export_tinker_brain_snapshot.py"),
            "eval_sha256": sha256_file(BRAIN / "tinker_brain_eval.py"),
        },
        "tools": {
            "ollama_version": str(version.get("version") or "unreachable"),
            "ollama_reachable": bool(tags),
        },
    }


def _read_jsonl(path: Path) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    try:
        for line in path.read_text(encoding="utf-8").splitlines():
            try:
                row = json.loads(line)
            except json.JSONDecodeError:
                continue
            if isinstance(row, dict):
                rows.append(row)
    except OSError:
        pass
    return rows


def diff(older: dict[str, Any], newer: dict[str, Any]) -> dict[str, Any]:
    changed: dict[str, list[str]] = {}
    for component in ("model", "prompts", "retrieval", "code", "tools"):
        old_c = older.get(component) or {}
        new_c = newer.get(component) or {}
        keys = sorted(set(old_c) | set(new_c))
        deltas = [k for k in keys if old_c.get(k) != new_c.get(k)]
        if deltas:
            changed[component] = deltas
    suspects = [COMPONENT_QUESTION[c] for c in changed if c in COMPONENT_QUESTION]
    return {
        "older": older.get("captured_at"),
        "newer": newer.get("captured_at"),
        "changed_components": changed,
        "suspects": suspects,
        "verdict": (
            "no component changed between captures — suspect the queries themselves (Q5, "
            "see tinker-brain-questions.jsonl) or an external dependency; reproduce with "
            "tinker_brain_eval.py before concluding"
            if not changed
            else "run tinker_brain_eval.py; if it fails, blame the changed component(s) above"
        ),
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="cmd", required=True)
    cap = sub.add_parser("capture")
    cap.add_argument("--question", default="")
    cap.add_argument("--out", type=Path, default=FINGERPRINTS)
    dif = sub.add_parser("diff")
    dif.add_argument("--log", type=Path, default=FINGERPRINTS)
    dif.add_argument("--verbose", action="store_true")
    args = parser.parse_args()

    if args.cmd == "capture":
        row = capture()
        args.out.parent.mkdir(parents=True, exist_ok=True)
        with args.out.open("a", encoding="utf-8") as handle:
            handle.write(json.dumps(row, sort_keys=True) + "\n")
        if args.question:
            with QUESTIONS.open("a", encoding="utf-8") as handle:
                handle.write(
                    json.dumps(
                        {"ts": row["captured_at"], "question": args.question[:500]},
                        sort_keys=True,
                    )
                    + "\n"
                )
        print(json.dumps({"ok": True, "captured_at": row["captured_at"]}, sort_keys=True))
        return 0

    rows = _read_jsonl(args.log)
    if len(rows) < 2:
        print(json.dumps({"ok": False, "reason": "need_at_least_two_captures"}, sort_keys=True))
        return 2
    result = diff(rows[-2], rows[-1])
    if args.verbose:
        result["older_fingerprint"] = rows[-2]
        result["newer_fingerprint"] = rows[-1]
    print(json.dumps(result, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
