#!/usr/bin/env python3
"""Fuzz the response contract: can a mutated banned phrase slip past the verifier?

The eval harness proves known-bad strings are caught; it says nothing about
trivial mutations (case, doubled spaces, smart punctuation, mid-sentence
embedding). A verifier that only matches the exact fixture strings is a
reward-hackable verifier. This runs every banned promo phrase through a set of
surface mutations and exits non-zero listing each mutation that ESCAPES
(produces zero violations). Escapes are contract bugs to fix, not noise.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from tinker_response_contract import (  # noqa: E402
    THUMBGATE_CONFLATION_PHRASES,
    THUMBGATE_OVERCLAIM_PHRASES,
    THUMBGATE_RESCUE_PHRASES,
    validate_response,
)

_FIXTURE_CARD = Path(__file__).resolve().parent / "fixtures" / "answer_card.txt"


def mutations(phrase: str) -> dict[str, str]:
    return {
        "verbatim": phrase,
        "upper": phrase.upper(),
        "title": phrase.title(),
        "double_space": phrase.replace(" ", "  "),
        "tab": phrase.replace(" ", "\t"),
        "embedded": f"Our plan is {phrase}, shipping next week.",
        "linewrap": phrase.replace(" ", "\n", 1),
    }


def main() -> int:
    card_text = _FIXTURE_CARD.read_text(encoding="utf-8")
    banned = (
        [(p, "continuity_rescue_language") for p in THUMBGATE_RESCUE_PHRASES]
        + [(p, "thumbgate_overclaim") for p in THUMBGATE_OVERCLAIM_PHRASES]
        + [(p, "thumbgate_ai_conflation") for p in THUMBGATE_CONFLATION_PHRASES]
    )
    escapes: list[dict[str, str]] = []
    checked = 0
    for phrase, expected in banned:
        for name, mutated in mutations(phrase).items():
            checked += 1
            response = f"AS_OF=2026-07-22T18:07:42Z\n{mutated}\n"
            violations = validate_response(response, card_text, "How do we sell ThumbGate.app?")
            if expected not in violations:
                escapes.append({"phrase": phrase, "mutation": name, "text": mutated,
                                "got": ",".join(violations) or "(none)"})
    report = {"checked": checked, "escapes": escapes}
    print(json.dumps(report, indent=2, sort_keys=True))
    return 1 if escapes else 0


if __name__ == "__main__":
    raise SystemExit(main())
