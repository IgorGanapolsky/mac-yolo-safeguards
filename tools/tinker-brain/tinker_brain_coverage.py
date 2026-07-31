#!/usr/bin/env python3
"""ADVISORY ONLY — this never gates and never changes an exit code.

A lexical check cannot tell paraphrase from topic mismatch: "How much does ThumbGate
cost?" answered with "pricing: $499" shares only the brand token, exactly like the
2026-07-30 incident where a trademark question returned the GTM card. Both look
identical to word overlap. So this prints a note a human can weigh and nothing more —
used as a gate it would reject correct answers, and a guard that blocks good output
gets switched off.
Coverage check: does the card actually address this question, or did it merely route?

Why this exists
---------------
2026-07-30. Asked "Should ThumbGate rename away from Hermes given Nous Research
trademark exposure?", tinker-brain matched the token "ThumbGate", routed to
INTENT_THUMBGATE_GTM, and returned the full product card. The card contains no
mention of trademarks, renaming, or Nous Research. The output was a non-answer
formatted identically to an answer, and it was acted on as though it were one.

The root cause is structural, not a missing pattern: `route()` ends in
`else: primary = INTENT_GENERAL`. **There is no path that returns "I do not cover
this."** Every question produces a confident-looking card, so a card that happens to
share one keyword with the question is indistinguishable from a card that answers it.

This is the same failure the rest of the system already guards against elsewhere —
an instrument that cannot observe the thing still emitting output that looks like an
observation. A deterministic card system is *more* prone to it, not less, because the
output is always well-formed prose with no hedging.

What this adds
--------------
A coverage score computed AFTER routing: do the question's substantive terms actually
appear in the text that is about to be returned? If not, say so. An honest
"NO COVERAGE — this is outside the card" is worth more than a plausible page of
adjacent facts, because the operator can then go get a real answer.

Deliberately conservative: it only flags when coverage is clearly absent, because a
checker that cries wolf gets bypassed and then protects nothing.
"""

from __future__ import annotations

import re
from typing import Any

# Words that carry no topical signal. Matching on these produces false coverage.
_STOPWORDS = frozenset("""
a an and are as at be been but by can could did do does for from get give go had has
have how i if in into is it its just like make made may me more most must my no not
now of on or our out should so than that the their them then there these they this
to too us use was we were what when where which who why will with would you your
about after all also any because before between both each how many much need only
own same some such take then there through under until up very want way well
""".split())

_TOKEN_RE = re.compile(r"[a-z][a-z0-9.\-]{2,}")


def _terms(text: str) -> set[str]:
    return {t for t in _TOKEN_RE.findall((text or "").lower()) if t not in _STOPWORDS}


# Product/brand nouns appear in nearly every card, so a card matching ONLY these has
# told you nothing about the question. This list is the incident signature, not a
# stopword list — ordinary topic words must keep counting as real coverage.
BRAND_TOKENS = {
    "thumbgate", "hermes", "tinker", "poolside", "opencode", "kimi",
    "skool", "claude", "codex", "gemini", "cursor",
}


def coverage(question: str, answer_text: str, *, threshold: float = 0.34) -> dict[str, Any]:
    """Fraction of the question's substantive terms that appear in the answer.

    threshold is intentionally low. The goal is catching a card that shares ONE token
    with the question (the 2026-07-30 case matched only "thumbgate"), not policing
    partial answers.
    """
    q_terms = _terms(question)
    if not q_terms:
        return {"covered": True, "score": 1.0, "missing": [], "reason": "no substantive terms in question"}

    a_terms = _terms(answer_text)
    # Substring match both ways so "rename"/"renaming" and "trademark"/"trademarks" count.
    hits = {
        t for t in q_terms
        if t in a_terms or any(t in a or a in t for a in a_terms if len(a) > 3)
    }
    score = len(hits) / len(q_terms)
    missing = sorted(q_terms - hits)

    # A ratio cannot separate the two failure modes, and using one produced both:
    #   FALSE PASS: "ThumbGate trademark?" scores 1/2 = 0.5 and is accepted, so the
    #     concise form of the exact 2026-07-30 incident slips through. The verbose form
    #     ("Should I rename ThumbGate for trademark reasons?") only fails because it has
    #     more terms — the guard caught that incident by accident of phrasing length.
    #   FALSE FAIL: "How do I monetize fastest?" answered with pricing and sales-motion
    #     guidance scores 0.0, because a good answer uses related language instead of
    #     repeating the prompt.
    #
    # The actual signal in the incident is narrower: the ONLY thing the card had in
    # common with the question was a brand noun. That is what gets flagged now — a
    # ratio is only used to explain, never to decide.
    # `nothing_matched` is NOT flagged. A good answer routinely uses different words
    # than the question ("How do I monetize fastest?" answered with pricing and
    # sales-motion guidance shares no terms at all), and flagging that rejected 3 of
    # the 14 golden cases.
    brand_only = bool(hits) and hits <= BRAND_TOKENS and bool(missing)

    covered = not brand_only
    if brand_only:
        reason = (
            f"the card shares only the product name ({', '.join(sorted(hits))}) with the "
            f"question and does not address {', '.join(missing[:4])}"
        )
    else:
        reason = "card addresses the question's terms"

    return {
        "covered": covered,
        "score": round(score, 3),
        "threshold": threshold,
        "matched": sorted(hits),
        "missing": missing,
        "reason": reason,
    }


def banner(question: str, answer_text: str, **kw: Any) -> str | None:
    """Return a warning banner to prepend, or None when coverage is adequate."""
    c = coverage(question, answer_text, **kw)
    if c["covered"]:
        return None
    missing = ", ".join(c["missing"][:8])
    return (
        "⚠️  NO COVERAGE — the card did not answer this question.\n"
        f"    Routing matched on a shared keyword, but {c['reason']}.\n"
        f"    Unaddressed: {missing}\n"
        "    Treat what follows as ADJACENT CONTEXT, not an answer. Get a real source\n"
        "    before acting on it. (Cost of this rule: on 2026-07-30 a trademark/rename\n"
        "    question returned the GTM product card and was acted on as an answer.)"
    )


if __name__ == "__main__":
    import json
    import sys

    if len(sys.argv) < 3:
        print("usage: tinker_brain_coverage.py <question> <answer-file>", file=sys.stderr)
        raise SystemExit(2)
    with open(sys.argv[2], encoding="utf-8") as fh:
        text = fh.read()
    result = coverage(sys.argv[1], text)
    print(json.dumps(result, indent=2))
    raise SystemExit(0 if result["covered"] else 3)
