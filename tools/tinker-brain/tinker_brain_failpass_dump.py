#!/usr/bin/env python3
"""Export FAIL→PASS supervised pairs — the training data the future adapter needs.

The brain's methods map (item 3) scopes LoRA/QLoRA to "a supervised adapter on
FAIL→PASS dumps". This builds that dump from evidence that already exists:

  * contract fixture cases whose candidate answers violate the contract
    (fixtures/contract_cases.json — each is a curated FAIL)
  * every banned-phrase mutation the verifier fuzzer generates (each mutation
    embedded in an assertive sentence is a FAIL)
  * production replay violations from the eval miner receipt, when any exist

The PASS side is free: ``answer(..., enforce_contract=True)`` already replaces
a violating render with the fail-closed card-faithful correction, so the
corrected text IS the deterministic gold output for that question.

Output: ~/.hermes/receipts/tinker-brain/failpass-pairs.jsonl (the exact path
tinker_brain_scorecard reads for the ML dimension) + a summary receipt.
Deduped by (question, fail_text) digest. Privacy: card-derived text only.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

sys.path.insert(0, str(Path(__file__).resolve().parent))

from tinker_brain_answer import answer, load_expert_card  # noqa: E402
from tinker_brain_verifier_fuzz import mutations  # noqa: E402
from tinker_response_contract import (  # noqa: E402
    THUMBGATE_CONFLATION_PHRASES,
    THUMBGATE_OVERCLAIM_PHRASES,
    THUMBGATE_RESCUE_PHRASES,
    validate_response,
)

FIXTURES = Path(__file__).resolve().parent / "fixtures"
RECEIPTS_DIR = Path.home() / ".hermes" / "receipts" / "tinker-brain"
DEFAULT_OUT = RECEIPTS_DIR / "failpass-pairs.jsonl"
DEFAULT_SUMMARY = RECEIPTS_DIR / "failpass-summary.json"
FUZZ_QUESTION = "How do we sell ThumbGate.app?"


def _digest(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def _pair(
    source: str, question: str, fail_text: str, fail_violations: list[str], pass_text: str
) -> dict[str, Any]:
    return {
        "schema_version": "tinker-failpass-pair/1",
        "source": source,
        "task": "tinker_brain_card_answer",
        "learning": "supervised",
        "adapter_family": "lora_candidate",
        "question": question,
        "question_digest": _digest(question),
        "fail_text": fail_text,
        "fail_digest": _digest(fail_text),
        "fail_violations": fail_violations,
        "pass_text": pass_text,
        "pass_digest": _digest(pass_text),
    }


def build_pairs(card_text: str, expert_text: str | None = None) -> list[dict[str, Any]]:
    pairs: list[dict[str, Any]] = []
    seen: set[tuple[str, str]] = set()
    pass_cache: dict[str, str] = {}

    def gold(question: str) -> str:
        if question not in pass_cache:
            result = answer(card_text, question, enforce_contract=True, expert_text=expert_text)
            if not result["ok"]:
                raise RuntimeError(f"gold answer itself violates contract for: {question!r}")
            pass_cache[question] = result["text"]
        return pass_cache[question]

    def add(source: str, question: str, fail_text: str) -> None:
        key = (_digest(question), _digest(fail_text))
        if key in seen:
            return
        violations = validate_response(fail_text, card_text, question)
        if not violations:
            return  # not actually a FAIL against the current contract
        seen.add(key)
        pairs.append(_pair(source, question, fail_text, violations, gold(question)))

    contract_cases = json.loads((FIXTURES / "contract_cases.json").read_text(encoding="utf-8"))
    for case in contract_cases.get("cases", []):
        if case.get("expected_violations"):
            add("contract_fixture:" + case["id"], case["question"], case["candidate"])

    for phrase in (
        THUMBGATE_RESCUE_PHRASES + THUMBGATE_OVERCLAIM_PHRASES + THUMBGATE_CONFLATION_PHRASES
    ):
        for mutated in mutations(phrase).values():
            add("fuzzer_mutation", FUZZ_QUESTION, f"AS_OF=2026-07-22T18:07:42Z\n{mutated}\n")

    miner = RECEIPTS_DIR / "miner-latest.json"
    if miner.is_file():
        try:
            report = json.loads(miner.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            report = {}
        for violation in report.get("replay_violations", []):
            question = violation.get("question", "")
            if question:
                # The recorded violating replay text isn't persisted in the
                # receipt; regenerate the raw render by disabling enforcement.
                raw = answer(card_text, question, enforce_contract=False, expert_text=expert_text)
                add("miner_replay", question, raw["text"])

    return pairs


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--card", type=Path, default=FIXTURES / "answer_card.txt",
                        help="fixture card by default for deterministic pairs")
    parser.add_argument("--out", type=Path, default=DEFAULT_OUT)
    parser.add_argument("--summary", type=Path, default=DEFAULT_SUMMARY)
    args = parser.parse_args()

    card_text = args.card.read_text(encoding="utf-8")
    pairs = build_pairs(card_text, expert_text=load_expert_card(None) or None)
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(
        "".join(json.dumps(p, sort_keys=True) + "\n" for p in pairs), encoding="utf-8"
    )
    args.out.chmod(0o600)

    by_source: dict[str, int] = {}
    for p in pairs:
        key = p["source"].split(":")[0]
        by_source[key] = by_source.get(key, 0) + 1
    summary = {
        "schema_version": "tinker-failpass-summary/1",
        "generated_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "card_path": str(args.card),
        "pairs_path": str(args.out),
        "pair_count": len(pairs),
        "by_source": by_source,
        "training_gate": "external (zero-spend + economics); this only stages data",
    }
    args.summary.write_text(json.dumps(summary, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(json.dumps(summary, indent=2, sort_keys=True))
    return 0 if pairs else 1


if __name__ == "__main__":
    raise SystemExit(main())
