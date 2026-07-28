#!/usr/bin/env python3
"""Rule-based intent router for tinker-brain (no LLM, fail-closed).

Small specialized routing beats huge general LLMs for this mini brain:
every question maps to a fixed answer family grounded in ANSWER_CARD.
"""

from __future__ import annotations

import argparse
import json
import re
from typing import Any

# Ordered: first match wins among exclusive families; multi-label possible via flags.
INTENT_CASH = "cash_truth"
INTENT_NEXT_MONEY = "next_money"
INTENT_SYSTEM_SCORES = "system_scores"
INTENT_IMPROVE = "improve_now"
INTENT_ECONOMICS = "model_economics"
INTENT_METHODS = "ml_methods"
INTENT_THUMBGATE_GTM = "thumbgate_gtm"
INTENT_OFF_SCOPE = "off_scope_refuse"
INTENT_GENERAL = "general_card"

OFF_SCOPE_PATTERNS = (
    r"\bobsidian vault\b",
    r"\bvault sync\b",
    r"\bdropbox\b",
    r"\bgoogle drive\b",
    r"\bonedrive\b",
    r"\btensorflow\b",
    r"\bfaiss\b",
    r"\bupwork\b",
    r"\bjeff\b",
    r"\bhilltown\b",
)

# ThumbGate.app is THE primary product (pivot 2026-07-27). Questions about the
# product itself, or about how to monetize/market/promote/sell it, get the
# expert GTM answer family grounded in THUMBGATE_EXPERT_CARD.
THUMBGATE_PATTERNS = (
    r"\bthumb\s?gate\b",
    r"thumbgate\.app",
    r"\bcontinuity add-?on\b",
)

GTM_POSITIONING_PATTERNS = (
    r"\bposition\w*",
    r"\bcategory\b",
    r"\bcompetit\w*",
    r"\bdifferentiat\w*",
    r"\bmessaging\b",
    r"\bnarrative\b",
)

GTM_PRICING_PATTERNS = (
    r"\bpric\w*",
    r"\bmonetiz\w*",
    r"\bpackag\w*",
    r"\btier\b",
    r"\bsku\b",
    r"\bfreemium\b",
    r"\bfree trial\b",
    r"\bupsell\b",
)

GTM_MARKETING_PATTERNS = (
    r"\bmarket\w*",
    r"\bpromo\w*",
    r"\badvertis\w*",
    r"\baeo\b",
    r"\banswer.?engine\b",
    r"\bseo\b",
    r"\bdistribut\w*",
    r"\blaunch\b",
    r"\bfan.?out\b",
    r"\bawareness\b",
    r"\bgo.?to.?market\b",
    r"\bgtm\b",
)

GTM_SALES_PATTERNS = (
    r"\bsell\w*\b",
    r"\bsales\b",
    r"\bbuyers?\b",
    r"\bicp\b",
    r"\bideal customer\b",
    r"\bsales motion\b",
    r"\bclose deals?\b",
)

CASH_PATTERNS = (
    r"\bcash\b",
    r"\brevenue\b",
    r"\bmoney\b",
    r"\bstripe\b",
    r"\bzero dollars\b",
    r"\bmade zero\b",
    r"\bwhy zero\b",
    r"\bexternal\b",
    r"\breassess\b",
    r"\bre-assess\b",
)

# Bare "make money" is an action request — next_money with cash stamp, not cash_truth-only.
MAKE_MONEY_ACTION_PATTERNS = (
    r"\bmake money\b",
    r"\bmaking money\b",
    r"\bearn money\b",
    r"\bdrive revenue\b",
    r"\bact autonomously\b",
)

# Pure diagnosis — stay on cash_truth even if "money" / product names appear.
# Includes CEO phrasing ("why we are not making money from thumbgate.app?").
CASH_DIAGNOSIS_PATTERNS = (
    r"\bwhy\b.{0,40}\bzero\b",
    r"\bmade zero\b",
    r"\bzero dollars\b",
    r"\bwhy zero\b",
    r"\bcash truth\b",
    r"\breassess\b",
    r"\bre-assess\b",
    # why (are we|we are|aren't we|…) not making money / no revenue / no cash
    r"\bwhy\b.{0,80}\b(?:not|no|zero|aren'?t|are not|isn'?t|is not)\b.{0,40}\b(?:making money|money|revenue|cash|sales)\b",
    r"\bwhy\b.{0,40}\b(?:making money|no revenue|no cash|no sales)\b",
    r"\bnot making money\b",
    r"\baren'?t making money\b",
    r"\bno (?:external )?(?:revenue|cash|sales)\b",
    r"\bwhy (?:is|are) (?:there )?no (?:external )?(?:revenue|cash|sales)\b",
)

NEXT_MONEY_PATTERNS = (
    r"\bnext money\b",
    r"\bhighest.?ev\b",
    r"\bwhat should i (?:do|post)\b",
    r"\bwhat (?:must|should) we do\b",
    r"\bhow (?:do|can|to) we make money\b",
    r"\bmake money today\b",
    r"\bmake money\b",
    r"\bmoney today\b",
    r"\btop money\b",
    r"\bnext dollar\b",
    r"\bwhat about now\b",
    r"\bwhere (?:are|is) we\b",
    r"\bstatus\b",
    r"\bfree.?value\b",
    r"\bprivate convert\b",
    r"\bship\b",
    r"\bcontinue\b",
)

SCORE_PATTERNS = (
    r"\bscores?\b",
    r"\bgrade\b",
    r"\bdata science\b",
    r"\bmachine learning\b",
    r"(?<![a-z])ml(?![a-z])",
    r"\brag\b",
    r"\bevaluation quality\b",
    r"\bsystem_scores\b",
    r"\badequate\b",
)

IMPROVE_PATTERNS = (
    r"\bimprov\w*",  # improve / improvements / improving
    r"\bmake better\b",
    r"\bmake all the improv",
    r"\bi'?ve made improv",
    r"\bgo ahead and make\b",
)

ECON_PATTERNS = (
    r"\bcost\b",
    r"\beconomics\b",
    r"\bhardware\b",
    r"\binference\b",
    r"\btraining cost\b",
    r"\bquantization\b",
    r"\bdocker free\b",
    r"\bpaid plan\b",
)

METHODS_PATTERNS = (
    r"\blora\b",
    r"\bqlora\b",
    r"\bdistill",
    r"\bpruning\b",
    r"\bmixed.?precision\b",
    r"\btransformer\b",
    r"\bcnn\b",
    r"\brnn\b",
    r"\bsupervised\b",
    r"\bunsupervised\b",
    r"\bsmall model\b",
    r"\barchitecture\b",
)


def _match_any(text: str, patterns: tuple[str, ...]) -> bool:
    return any(re.search(p, text, flags=re.I) for p in patterns)


def route(question: str) -> dict[str, Any]:
    """Return primary intent + flags for deterministic answering."""
    q = (question or "").strip()
    lowered = q.lower()
    flags: dict[str, bool] = {
        "wants_cash": _match_any(lowered, CASH_PATTERNS),
        "wants_next_money": _match_any(lowered, NEXT_MONEY_PATTERNS),
        "wants_make_money_action": _match_any(lowered, MAKE_MONEY_ACTION_PATTERNS),
        "cash_diagnosis": _match_any(lowered, CASH_DIAGNOSIS_PATTERNS),
        "wants_scores": _match_any(lowered, SCORE_PATTERNS),
        "wants_improve": _match_any(lowered, IMPROVE_PATTERNS),
        "wants_economics": _match_any(lowered, ECON_PATTERNS),
        "wants_methods": _match_any(lowered, METHODS_PATTERNS),
        "off_scope_hit": _match_any(lowered, OFF_SCOPE_PATTERNS),
        "wants_thumbgate_product": _match_any(lowered, THUMBGATE_PATTERNS),
        "wants_gtm_positioning": _match_any(lowered, GTM_POSITIONING_PATTERNS),
        "wants_gtm_pricing": _match_any(lowered, GTM_PRICING_PATTERNS),
        "wants_gtm_marketing": _match_any(lowered, GTM_MARKETING_PATTERNS),
        "wants_gtm_sales": _match_any(lowered, GTM_SALES_PATTERNS),
    }
    # "make money" is next-money unless the user is clearly diagnosing zero cash.
    if flags["wants_make_money_action"] and not flags["cash_diagnosis"]:
        flags["wants_next_money"] = True
    # Diagnosis always wins over next-money leakage from "making money" tokens.
    if flags["cash_diagnosis"]:
        flags["wants_next_money"] = False
    gtm_hit = (
        flags["wants_gtm_positioning"]
        or flags["wants_gtm_pricing"]
        or flags["wants_gtm_marketing"]
        or flags["wants_gtm_sales"]
    )
    flags["wants_thumbgate_gtm"] = flags["wants_thumbgate_product"] or gtm_hit

    # Off-scope primary only when user is *asking to do* vault/stack work,
    # not when asking about the ban as policy.
    if flags["off_scope_hit"] and flags["wants_improve"] and not flags["wants_thumbgate_gtm"]:
        primary = INTENT_OFF_SCOPE
    elif flags["cash_diagnosis"]:
        # CEO "why aren't we making money from thumbgate?" is cash_truth, not a
        # full GTM encyclopedia dump. Product mention alone must not steal this.
        primary = INTENT_CASH
    elif flags["wants_thumbgate_gtm"]:
        # Primary product first: any ThumbGate.app mention or monetize/market/
        # promote/sell/position question gets the expert GTM answer family.
        primary = INTENT_THUMBGATE_GTM
    elif flags["wants_methods"] and not flags["wants_cash"]:
        primary = INTENT_METHODS
    elif flags["wants_economics"] and not flags["wants_cash"]:
        primary = INTENT_ECONOMICS
    elif flags["wants_scores"] and not flags["wants_next_money"]:
        primary = INTENT_SYSTEM_SCORES
    elif flags["wants_next_money"] or flags["wants_improve"]:
        # Improve/continue always maps to money-path action, not vault rebuild.
        primary = INTENT_NEXT_MONEY if flags["wants_next_money"] else INTENT_IMPROVE
    elif flags["wants_cash"]:
        primary = INTENT_CASH
    elif flags["off_scope_hit"]:
        primary = INTENT_OFF_SCOPE
    else:
        primary = INTENT_GENERAL

    # Cash reassessment that also asks improve → still include cash in answer.
    if flags["wants_cash"] and primary in {INTENT_IMPROVE, INTENT_NEXT_MONEY}:
        flags["force_cash_block"] = True
    else:
        flags["force_cash_block"] = (
            flags["wants_cash"] or primary == INTENT_CASH or flags["wants_make_money_action"]
        )

    return {
        "schema_version": "tinker-brain-router/1",
        "primary": primary,
        "flags": flags,
        "model_required": False,
        "answer_mode": "deterministic_card",
        "learning_mode": "supervised_routing_rules_not_llm",
        "architecture": "rules_router_not_transformer",
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("question", nargs="?", default="")
    parser.add_argument("--json", action="store_true")
    args = parser.parse_args()
    result = route(args.question)
    if args.json:
        print(json.dumps(result, indent=2, sort_keys=True))
    else:
        print(result["primary"])
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
