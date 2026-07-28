#!/usr/bin/env python3
"""Mine production traces into proposed eval cases (trace -> failure -> eval).

Closes the loop the eval harness alone cannot: eval_cases.json only regresses
questions someone thought to pin. This miner reads what users actually asked
(traces.jsonl, falling back to questions.jsonl for older question-only logs),
replays every question through the CURRENT router+card (the engine is
deterministic, so replay == rerun), and reports:

  * contract violations on replay (the answer the brain would give TODAY),
  * router intents with production traffic but zero eval coverage,
  * proposed eval cases (deduped against the existing fixtures) ready for
    human review — never auto-appended to the golden set.

Receipt: ~/.hermes/receipts/tinker-brain/miner-latest.json
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path
from typing import Any

sys.path.insert(0, str(Path(__file__).resolve().parent))

from tinker_brain_answer import answer, load_expert_card  # noqa: E402

_RECEIPTS = Path.home() / ".hermes" / "receipts" / "tinker-brain"
_FIXTURES = Path(__file__).resolve().parent / "fixtures"


def _norm_question(question: str) -> str:
    return re.sub(r"\s+", " ", question.strip().lower())


def load_traced_questions(trace_dir: Path) -> list[dict[str, Any]]:
    """Newest-last unique questions from traces.jsonl, else questions.jsonl."""
    records: dict[str, dict[str, Any]] = {}
    for name in ("questions.jsonl", "traces.jsonl"):
        path = trace_dir / name
        if not path.is_file():
            continue
        for line in path.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if not line:
                continue
            try:
                rec = json.loads(line)
            except json.JSONDecodeError:
                continue
            question = rec.get("question", "")
            if question:
                records[_norm_question(question)] = {"question": question, "ts": rec.get("ts")}
    return list(records.values())


def eval_covered(fixtures_dir: Path) -> tuple[set[str], set[str]]:
    """(normalized questions, expected routes) already pinned in the fixtures."""
    questions: set[str] = set()
    routes: set[str] = set()
    for name in ("eval_cases.json", "contract_cases.json"):
        path = fixtures_dir / name
        if not path.is_file():
            continue
        data = json.loads(path.read_text(encoding="utf-8"))
        for case in data.get("cases", []):
            if case.get("question"):
                questions.add(_norm_question(case["question"]))
            if case.get("expect_route"):
                routes.add(case["expect_route"])
    return questions, routes


def mine(card_path: Path, trace_dir: Path, fixtures_dir: Path) -> dict[str, Any]:
    card_text = card_path.read_text(encoding="utf-8")
    expert_text = load_expert_card(None)
    covered_questions, covered_routes = eval_covered(fixtures_dir)

    traffic: dict[str, int] = {}
    violations: list[dict[str, Any]] = []
    proposed: list[dict[str, Any]] = []
    replayed = 0

    for rec in load_traced_questions(trace_dir):
        question = rec["question"]
        result = answer(card_text, question, enforce_contract=True, expert_text=expert_text)
        replayed += 1
        route_id = result["routing"]["primary"]
        traffic[route_id] = traffic.get(route_id, 0) + 1

        is_new = _norm_question(question) not in covered_questions
        if result["violations"]:
            violations.append(
                {"question": question, "route": route_id, "violations": result["violations"]}
            )
        if is_new and (result["violations"] or route_id not in covered_routes):
            proposed.append(
                {
                    "id": "mined_" + re.sub(r"[^a-z0-9]+", "_", _norm_question(question))[:48].strip("_"),
                    "question": question,
                    "expect_route": route_id,
                    "why": ("replay_contract_violation" if result["violations"] else "uncovered_route"),
                    "first_seen": rec.get("ts"),
                }
            )

    uncovered = sorted(r for r in traffic if r not in covered_routes)
    return {
        "schema_version": "tinker-brain-miner/1",
        "replayed": replayed,
        "intent_traffic": traffic,
        "replay_violations": violations,
        "uncovered_routes_with_traffic": uncovered,
        "proposed_cases": proposed,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--card", type=Path,
                        default=Path.home() / ".hermes" / "business-brain" / "data-snapshot" / "ANSWER_CARD.txt")
    parser.add_argument("--trace-dir", type=Path, default=_RECEIPTS)
    parser.add_argument("--fixtures", type=Path, default=_FIXTURES)
    parser.add_argument("--emit", type=Path, default=None,
                        help="also write proposed_cases to this JSON file for review")
    args = parser.parse_args()

    if not args.card.is_file():
        print(f"miner: card not found: {args.card}", file=sys.stderr)
        return 2
    report = mine(args.card, args.trace_dir, args.fixtures)

    try:
        _RECEIPTS.mkdir(parents=True, exist_ok=True)
        (_RECEIPTS / "miner-latest.json").write_text(
            json.dumps(report, indent=2, sort_keys=True) + "\n", encoding="utf-8"
        )
    except OSError:
        pass
    if args.emit and report["proposed_cases"]:
        args.emit.write_text(
            json.dumps({"cases": report["proposed_cases"]}, indent=2, sort_keys=True) + "\n",
            encoding="utf-8",
        )
    print(json.dumps(report, indent=2, sort_keys=True))
    return 1 if report["replay_violations"] else 0


if __name__ == "__main__":
    raise SystemExit(main())
