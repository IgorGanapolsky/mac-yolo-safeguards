#!/usr/bin/env python3
"""Fail closed when a local Tinker answer drifts from its evidence card."""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

SCORE_RE = re.compile(r"\b(?:100|[1-9]?\d)/100\b")
AS_OF_RE = re.compile(r"\b20\d{2}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z\b")
UNSUPPORTED_STACK_TERMS = (
    "dropbox",
    "google drive",
    "onedrive",
    "google cloud",
    "tensorflow",
    "pytorch",
    "scikit-learn",
    "elasticsearch",
    "faiss",
    "bert",
    "gpt-3",
    "skool api",
)

# ThumbGate.app promo-truth bans (PR #1075 + positioning research). These fire
# only in assertive context — lines that quote them as "never say X" guidance
# are exempt via _NEGATION_MARKERS.
THUMBGATE_RESCUE_PHRASES = (
    "phone cannot reach",
    "pair a mac and continue",
    "fallback for a broken",
    "instead of hermes mobile",
    "replacement for hermes",
    "replaces hermes mobile",
    "fixes mobile connectivity",
    "repairs mobile connectivity",
)
THUMBGATE_OVERCLAIM_PHRASES = (
    "seamless failover",
    "agent never stops",
    "always works",
    "guaranteed uptime",
    "e2ee",
    "end-to-end encrypted",
    "fully private",
    "live process migration is supported",
)
THUMBGATE_CONFLATION_PHRASES = (
    "thumbgate.ai",
    "self-improving firewall",
)
_NEGATION_MARKERS = (
    "never say",
    "never conflate",
    "not e2ee",
    "rejected framing",
    "fails the regression gate",
    "rescue language",
    "separate product",
    "is not live process migration",
    "not process migration",
)


def _assertive_text(lowered_response: str) -> str:
    """Drop lines that quote banned phrases as guidance rather than claims."""
    kept = [
        line
        for line in lowered_response.splitlines()
        if not any(marker in line for marker in _NEGATION_MARKERS)
    ]
    return "\n".join(kept)


def parse_card(card_text: str) -> dict[str, str]:
    fields: dict[str, str] = {}
    for raw in card_text.splitlines():
        line = raw.strip()
        if "=" not in line:
            continue
        key, value = line.split("=", 1)
        if key and key.replace("_", "").isalnum():
            fields[key] = value.strip()
    return fields


def _requires_cash_truth(question: str) -> bool:
    lowered = question.lower()
    return any(
        token in lowered
        for token in (
            "reassess",
            "re-assess",
            "why zero",
            "zero dollars",
            "made zero",
            "cash",
            "revenue",
            "money",
        )
    )


def _usd_field(fields: dict[str, str], key: str) -> str:
    raw = fields.get(key, "0").split()[0]
    try:
        return f"${float(raw):.2f}"
    except ValueError:
        return "$0.00"


def _usd_amount(fields: dict[str, str], key: str) -> float:
    raw = fields.get(key, "0").split()[0]
    try:
        return float(raw)
    except ValueError:
        return 0.0


def render_response(card_text: str, user_question: str) -> str:
    """Render a concise answer from card fields without model inference.

    Delegates to the intent router + deterministic answerer when available so
    small specialized routing stays ahead of huge general LLMs.
    """
    try:
        from tinker_brain_answer import render_from_route
    except ModuleNotFoundError:
        render_from_route = None  # type: ignore
    if render_from_route is not None:
        return render_from_route(card_text, user_question)

    # Minimal fallback if answer module missing.
    fields = parse_card(card_text)
    return (
        f"AS_OF={fields.get('AS_OF', 'not evidenced')}\n"
        f"Cash: external {_usd_field(fields, 'EXTERNAL_USD')}. "
        f"Owner/test {_usd_field(fields, 'OWNER_TEST_USD')} and is not revenue.\n"
        f"Why external cash is zero: {fields.get('WHY_ZERO', 'not evidenced by the current card')}\n"
        "Private conversion: blocked until the exact person expresses explicit buyer-intent.\n"
        "Immediate improvement: keep the fresh deterministic snapshot and golden response contract, "
        "then act only on verified Skool/Reddit buyer-intent.\n"
    )


def validate_response(response: str, card_text: str, user_question: str) -> list[str]:
    """Return stable violation codes; an empty list means the answer may be shown."""

    fields = parse_card(card_text)
    lowered = response.lower()
    violations: list[str] = []

    # ThumbGate.app is the primary product (pivot 2026-07-27). The remaining
    # category ban prevents mispositioning it as endpoint security, and the
    # promo-truth bans mechanically enforce the PROMO_RULES lessons.
    if "endpoint security" in lowered:
        violations.append("endpoint_category_mentioned")
    assertive = _assertive_text(lowered)
    if any(phrase in assertive for phrase in THUMBGATE_RESCUE_PHRASES):
        violations.append("continuity_rescue_language")
    if any(phrase in assertive for phrase in THUMBGATE_OVERCLAIM_PHRASES):
        violations.append("thumbgate_overclaim")
    if "thumbgate" in lowered and any(
        phrase in assertive for phrase in THUMBGATE_CONFLATION_PHRASES
    ):
        violations.append("thumbgate_ai_conflation")

    question_lower = user_question.lower()
    card_lower = card_text.lower()
    if "obsidian" in lowered and "obsidian" not in question_lower and "obsidian" not in card_lower:
        violations.append("off_scope_obsidian")
    if "github" in lowered and "github" not in question_lower and "github" not in card_lower:
        violations.append("off_scope_github")
    focus_lower = fields.get("FOCUS", "").lower()
    if "skool" in focus_lower and "reddit" in focus_lower:
        if "github" in lowered:
            violations.append("focus_channel_mismatch")
        if "gmail" in lowered:
            violations.append("focus_channel_mismatch")
    if any(token in lowered for token in UNSUPPORTED_STACK_TERMS):
        violations.append("unsupported_stack_recommendation")
    # ThumbGate.app has a real 14-day trial SKU, so trial language is legitimate
    # on its GTM routes; elsewhere it is still an invented offer change.
    if "free trial" in lowered or "free demo" in lowered:
        try:
            from tinker_brain_router import route as _route
        except ModuleNotFoundError:
            _route = None  # type: ignore
        primary = _route(user_question)["primary"] if _route else ""
        if primary != "thumbgate_gtm":
            violations.append("unsupported_offer_change")
    if any(
        phrase in lowered
        for phrase in (
            "i can't access",
            "i cannot access",
            "need you to provide",
            "let me know how you'd like",
        )
    ):
        violations.append("false_access_or_user_handoff")

    expected_as_of = fields.get("AS_OF")
    if expected_as_of:
        match = re.search(r"AS_OF\s*[:=]\s*(%s)" % AS_OF_RE.pattern, response, re.IGNORECASE)
        if match and match.group(1) != expected_as_of:
            violations.append("stale_as_of")

    cash_required = _requires_cash_truth(user_question)
    if cash_required:
        if expected_as_of and expected_as_of not in response:
            violations.append("as_of_missing")
        expected_external = _usd_amount(fields, "EXTERNAL_USD")
        if expected_external == 0:
            if not re.search(r"external.{0,24}(?:\$0(?:\.00)?|0\.0)", lowered):
                violations.append("external_cash_missing")
            if "non-owner" not in lowered and "qualified buyer" not in lowered:
                violations.append("zero_cash_cause_missing")
        else:
            # Non-zero truth: the exact verified amount must appear, and $0
            # claims are stale.
            amount = f"{expected_external:.2f}"
            if amount not in response:
                violations.append("external_cash_missing")
            if re.search(r"external.{0,24}\$0(?:\.00)?\b", lowered):
                violations.append("stale_zero_cash_claim")

    if "total cash" in lowered or "total revenue" in lowered:
        violations.append("owner_test_aggregation_risk")
    if re.search(r"owner(?:/test|[- ]test).{0,20}\$?10", lowered):
        owner_window = re.search(r"owner(?:/test|[- ]test).{0,80}", lowered)
        if owner_window and "not revenue" not in owner_window.group(0):
            violations.append("owner_test_not_disclaimed")

    allowed_scores = set(SCORE_RE.findall(fields.get("SYSTEM_SCORES", "")))
    observed_scores = set(SCORE_RE.findall(response))
    if observed_scores - allowed_scores:
        violations.append("invented_score")

    if "private convert" in lowered or "private conversion" in lowered:
        if not any(
            token in lowered
            for token in (
                "only after",
                "explicit interest",
                "requested",
                "eligible_now=false",
                "blocked",
            )
        ):
            violations.append("unguarded_private_conversion")

    if any(token in question_lower for token in ("improve", "improvement", "make better")):
        grounded_terms = (
            "buyer-intent",
            "contract",
            "deterministic",
            "golden",
            "headless",
            "latency",
            "provider",
            "snapshot",
            "zero-spend",
            "freeze",
            "write rail",
            "stripe",
        )
        if not any(token in lowered for token in grounded_terms):
            violations.append("ungrounded_improvement_advice")

    # Fail closed: do not blame FREEZE for $0 when the card says FREEZE_LIVE=false.
    freeze_live = (fields.get("FREEZE_LIVE") or "").strip().lower()
    if freeze_live == "false":
        false_freeze_blame = any(
            phrase in lowered
            for phrase in (
                "public_write_freeze is on",
                "public_write_freeze live on",
                "freeze is on",
                "freeze is blocking",
                "blocked by freeze",
                "blocked by public_write_freeze",
                "because of the freeze",
                "due to freeze",
                "due to the freeze",
                "freeze prevents cash",
                "freeze is the reason",
                "cash blocker is freeze",
                "cash is blocked by freeze",
            )
        )
        if false_freeze_blame:
            violations.append("false_freeze_cash_blocker")

    return sorted(set(violations))


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--card", type=Path, required=True)
    parser.add_argument("--question", required=True)
    parser.add_argument("--response", type=Path, help="Response file; stdin when omitted")
    parser.add_argument("--render", action="store_true", help="Render a deterministic answer")
    args = parser.parse_args()
    card_text = args.card.read_text(encoding="utf-8")
    if args.render:
        print(render_response(card_text, args.question), end="")
        return 0
    response = (
        args.response.read_text(encoding="utf-8")
        if args.response
        else sys.stdin.read()
    )
    violations = validate_response(response, card_text, args.question)
    print(json.dumps({"ok": not violations, "violations": violations}, sort_keys=True))
    return 0 if not violations else 2


if __name__ == "__main__":
    raise SystemExit(main())
