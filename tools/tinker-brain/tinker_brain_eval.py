#!/usr/bin/env python3
"""Reproducible end-to-end eval for tinker-brain ("did the chatbot get worse?").

Runs the golden question set (fixtures/tinker_brain/eval_cases.json) through
the real router + deterministic answer + response contract against a pinned
fixture card by default (fully reproducible) or the live ANSWER_CARD with
--live. Writes a JSON receipt with card/expert/code digests so a failing run
names which component to suspect. Zero model spend; optional --structured adds
the local-Ollama structured path per case.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

BRAIN = Path(__file__).resolve().parent
REPO = BRAIN.parents[1]
DEFAULT_CASES = BRAIN / "fixtures" / "eval_cases.json"
DEFAULT_CONTRACT_CASES = BRAIN / "fixtures" / "contract_cases.json"
DEFAULT_CARD = BRAIN / "fixtures" / "answer_card.txt"
LIVE_CARD = Path.home() / ".hermes" / "business-brain" / "data-snapshot" / "ANSWER_CARD.txt"
RECEIPTS_DIR = Path.home() / ".hermes" / "receipts" / "tinker-brain"
DEFAULT_OUT = RECEIPTS_DIR / "eval-latest.json"
HISTORY = RECEIPTS_DIR / "eval-history.jsonl"

sys.path.insert(0, str(BRAIN))

from tinker_brain_answer import answer, load_expert_card  # noqa: E402
from tinker_brain_router import route  # noqa: E402
from tinker_response_contract import validate_response  # noqa: E402


def sha256_file(path: Path) -> str:
    try:
        return hashlib.sha256(path.read_bytes()).hexdigest()
    except OSError:
        return "missing"


def utc_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def run_case(case: dict[str, Any], card_text: str, expert_text: str) -> dict[str, Any]:
    question = case["question"]
    failures: list[str] = []
    routing = route(question)
    if case.get("expect_route") and routing["primary"] != case["expect_route"]:
        failures.append(f"route={routing['primary']} expected={case['expect_route']}")
    result = answer(card_text, question, expert_text=expert_text)
    if not result["ok"]:
        failures.append(f"contract_violations={result['violations']}")
    text_lower = result["text"].lower()
    for token in case.get("must_contain") or []:
        if token.lower() not in text_lower:
            failures.append(f"missing_substring={token!r}")
    for token in case.get("must_not_contain") or []:
        if token.lower() in text_lower:
            failures.append(f"forbidden_substring={token!r}")
    return {
        "id": case["id"],
        "ok": not failures,
        "route": routing["primary"],
        "failures": failures,
    }


def run_contract_case(case: dict[str, Any], card_text: str) -> dict[str, Any]:
    """Golden candidate-answer cases: expected contract verdicts must be exact."""
    observed = validate_response(case["candidate"], card_text, case["question"])
    expected = sorted(case.get("expected_violations") or [])
    ok = observed == expected
    return {
        "id": f"contract:{case['id']}",
        "ok": ok,
        "route": "contract_case",
        "failures": [] if ok else [f"expected={expected} observed={observed}"],
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--cases", type=Path, default=DEFAULT_CASES)
    parser.add_argument("--contract-cases", type=Path, default=DEFAULT_CONTRACT_CASES)
    parser.add_argument("--card", type=Path, default=DEFAULT_CARD)
    parser.add_argument(
        "--live", action="store_true", help="Use the live exported ANSWER_CARD instead of the fixture"
    )
    parser.add_argument("--expert-card", type=Path, default=None)
    parser.add_argument("--out", type=Path, default=DEFAULT_OUT)
    parser.add_argument("--json", action="store_true", help="Print full receipt JSON to stdout")
    args = parser.parse_args()

    card_path = LIVE_CARD if args.live else args.card
    card_text = card_path.read_text(encoding="utf-8")
    expert_path = args.expert_card or (REPO / "config" / "THUMBGATE_EXPERT_CARD.txt")
    expert_text = load_expert_card(expert_path)

    spec = json.loads(args.cases.read_text(encoding="utf-8"))
    cases = spec.get("cases") or []
    results = [run_case(case, card_text, expert_text) for case in cases]
    contract_spec = (
        json.loads(args.contract_cases.read_text(encoding="utf-8"))
        if args.contract_cases.is_file()
        else {}
    )
    fixture_card_text = DEFAULT_CARD.read_text(encoding="utf-8")
    for case in contract_spec.get("cases") or []:
        # Contract cases pin exact violation lists, so they always run against
        # the fixture card (live card values would shift AS_OF expectations).
        results.append(run_contract_case(case, fixture_card_text))
    failed = [r for r in results if not r["ok"]]

    receipt = {
        "schema_version": "tinker-brain-eval/1",
        "ran_at": utc_now(),
        "card": {"path": str(card_path), "sha256": sha256_file(card_path), "live": args.live},
        "expert_card": {"path": str(expert_path), "sha256": sha256_file(expert_path)},
        "cases_sha256": sha256_file(args.cases),
        "contract_cases_sha256": sha256_file(args.contract_cases),
        "code": {
            "router_sha256": sha256_file(BRAIN / "tinker_brain_router.py"),
            "answer_sha256": sha256_file(BRAIN / "tinker_brain_answer.py"),
            "contract_sha256": sha256_file(BRAIN / "tinker_response_contract.py"),
            "exporter_sha256": sha256_file(BRAIN / "export_tinker_brain_snapshot.py"),
        },
        "total": len(results),
        "passed": len(results) - len(failed),
        "failed": len(failed),
        "failures": failed,
        "results": results,
    }
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(receipt, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    HISTORY.parent.mkdir(parents=True, exist_ok=True)
    with HISTORY.open("a", encoding="utf-8") as handle:
        handle.write(
            json.dumps(
                {
                    "ran_at": receipt["ran_at"],
                    "passed": receipt["passed"],
                    "failed": receipt["failed"],
                    "card_sha256": receipt["card"]["sha256"],
                    "expert_sha256": receipt["expert_card"]["sha256"],
                    "live": args.live,
                },
                sort_keys=True,
            )
            + "\n"
        )

    if args.json:
        print(json.dumps(receipt, indent=2, sort_keys=True))
    else:
        for row in results:
            marker = "PASS" if row["ok"] else "FAIL"
            line = f"[{marker}] {row['id']} (route={row['route']})"
            if row["failures"]:
                line += " :: " + "; ".join(row["failures"])
            print(line)
        print(
            f"tinker-brain eval: {receipt['passed']}/{receipt['total']} passed "
            f"(card={'live' if args.live else 'fixture'}); receipt={args.out}"
        )
    return 0 if not failed else 2


if __name__ == "__main__":
    raise SystemExit(main())
