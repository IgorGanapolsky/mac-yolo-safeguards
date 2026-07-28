#!/usr/bin/env python3
"""Deterministic tinker-brain answers from ANSWER_CARD + intent router.

No Ollama. No invented scores. Optional JSON envelope for contracts/tests.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any

sys.path.insert(0, str(Path(__file__).resolve().parent))

from tinker_brain_router import (  # noqa: E402
    INTENT_CASH,
    INTENT_ECONOMICS,
    INTENT_GENERAL,
    INTENT_IMPROVE,
    INTENT_METHODS,
    INTENT_NEXT_MONEY,
    INTENT_OFF_SCOPE,
    INTENT_SYSTEM_SCORES,
    INTENT_THUMBGATE_GTM,
    route,
)
from tinker_response_contract import parse_card, validate_response  # noqa: E402

# ThumbGate.app GTM expertise. Snapshot copy first (ships with ANSWER_CARD so
# chat answers stay atomic with the export), repo copy as fallback.
_REPO_EXPERT_CARD = (
    Path(__file__).resolve().parents[2] / "config" / "THUMBGATE_EXPERT_CARD.txt"
)
_SNAPSHOT_EXPERT_CARD = (
    Path.home() / ".hermes" / "business-brain" / "data-snapshot" / "THUMBGATE_EXPERT_CARD.txt"
)


def load_expert_card(explicit: Path | None = None) -> str:
    import os

    candidates = [
        explicit,
        Path(os.environ["TINKER_THUMBGATE_CARD"]) if os.environ.get("TINKER_THUMBGATE_CARD") else None,
        _SNAPSHOT_EXPERT_CARD,
        _REPO_EXPERT_CARD,
    ]
    for path in candidates:
        if path and path.is_file():
            try:
                return path.read_text(encoding="utf-8")
            except OSError:
                continue
    return ""


def parse_expert_sections(expert_text: str) -> dict[str, list[str]]:
    sections: dict[str, list[str]] = {}
    current: str | None = None
    for raw in expert_text.splitlines():
        line = raw.rstrip()
        if line.startswith("[") and line.endswith("]"):
            current = line[1:-1].strip().upper()
            sections[current] = []
        elif current and line.strip():
            sections[current].append(line.strip())
    return sections


def _thumbgate_sections_for_flags(flags: dict[str, Any]) -> list[str]:
    wanted: list[str] = []
    if flags.get("wants_gtm_positioning"):
        wanted += ["POSITIONING", "BUYER"]
    if flags.get("wants_gtm_pricing"):
        wanted += ["PRICING", "PRODUCT"]
    if flags.get("wants_gtm_marketing"):
        wanted += ["CHANNELS", "PROMO_RULES"]
    if flags.get("wants_gtm_sales"):
        wanted += ["SALES_MOTION", "BUYER"]
    if not wanted:
        wanted = ["PRODUCT", "POSITIONING", "SALES_MOTION"]
    seen: set[str] = set()
    ordered: list[str] = []
    for name in wanted:
        if name not in seen:
            seen.add(name)
            ordered.append(name)
    return ordered


def _usd_field(fields: dict[str, str], key: str) -> str:
    raw = fields.get(key, "0").split()[0]
    try:
        return f"${float(raw):.2f}"
    except ValueError:
        return "$0.00"


def render_from_route(
    card_text: str,
    user_question: str,
    routing: dict[str, Any] | None = None,
    expert_text: str | None = None,
) -> str:
    fields = parse_card(card_text)
    routing = routing or route(user_question)
    primary = routing["primary"]
    flags = routing.get("flags") or {}
    lines: list[str] = []

    # Always stamp AS_OF for contract cash paths and grounding.
    lines.append(f"AS_OF={fields.get('AS_OF', 'not evidenced')}")
    lines.append(
        f"Focus: {fields.get('FOCUS', 'Sell ThumbGate.app first; Skool/Reddit are acquisition channels')}"
    )
    lines.append(f"Route: {primary} (deterministic_card; model_required=false)")

    if primary == INTENT_THUMBGATE_GTM:
        expert = expert_text if expert_text is not None else load_expert_card()
        sections = parse_expert_sections(expert)
        if sections:
            header = next(
                (ln for ln in expert.splitlines() if ln.startswith("AS_OF_RESEARCH:")),
                "AS_OF_RESEARCH: unknown",
            )
            lines.append(f"ThumbGate.app GTM expert answer ({header.strip()}):")
            for name in _thumbgate_sections_for_flags(flags):
                body = sections.get(name) or []
                if not body:
                    continue
                lines.append(f"[{name}]")
                lines.extend(f"  - {item}" for item in body)
            gaps = sections.get("KNOWN_GAPS") or []
            if gaps and "KNOWN_GAPS" not in _thumbgate_sections_for_flags(flags):
                lines.append("[KNOWN_GAPS — keep claims honest]")
                lines.extend(f"  - {item}" for item in gaps[:2])
            lines.append(
                "Grounding rule: live https://thumbgate.app/api/billing/plan outranks this card for "
                "price; never hard-code a dollar amount into campaign copy; cash is only non-owner "
                "Stripe paid."
            )
        else:
            lines.append(
                "ThumbGate expert card missing (rag/thumbgate/THUMBGATE_EXPERT_CARD.txt): "
                "refusing to invent GTM guidance; re-export the snapshot to restore it."
            )

    if flags.get("force_cash_block") or primary in {INTENT_CASH, INTENT_GENERAL, INTENT_IMPROVE, INTENT_NEXT_MONEY}:
        lines.append(
            f"Cash: external {_usd_field(fields, 'EXTERNAL_USD')}. "
            f"Owner/test {_usd_field(fields, 'OWNER_TEST_USD')} and is not revenue."
        )
        lines.append(
            f"Why external cash is zero: {fields.get('WHY_ZERO', 'not evidenced by the current card')}"
        )
        if fields.get("FUNNEL_STATE"):
            lines.append(f"Funnel: {fields['FUNNEL_STATE']}")
        # Explicit freeze/rail stamp so tiny models cannot invent FREEZE-as-cash-blocker.
        freeze_live = (fields.get("FREEZE_LIVE") or "").strip().lower()
        if freeze_live in {"true", "false"}:
            lines.append(
                f"Write freeze live: FREEZE_LIVE={freeze_live}"
                + (f" (source={fields['FREEZE_SOURCE']})" if fields.get("FREEZE_SOURCE") else "")
                + (
                    ". FREEZE is OFF — not the reason cash is $0."
                    if freeze_live == "false"
                    else ". FREEZE is ON — mass public spam blocked; scoped allowlist still may apply."
                )
            )
        if fields.get("WRITE_RAIL"):
            lines.append(f"Write rail: {fields['WRITE_RAIL']}")

    authorized = fields.get("PRIVATE_CONVERT_AUTHORIZED", "false").lower() == "true"
    if primary in {
        INTENT_CASH,
        INTENT_NEXT_MONEY,
        INTENT_IMPROVE,
        INTENT_GENERAL,
        INTENT_OFF_SCOPE,
    }:
        if authorized:
            lines.append(
                "Private conversion: eligible for one exact person only because current provider "
                "evidence contains that person's explicit request; claim and reconcile the action once."
            )
        else:
            lines.append(
                "Private conversion: blocked because there is no exact, current, provider-verified "
                "explicit request for our sample, fit check, or intake "
                "(PRIVATE_CONVERT_AUTHORIZED=false)."
            )
        if fields.get("PROVIDER_EVIDENCE"):
            lines.append(f"Provider evidence: {fields['PROVIDER_EVIDENCE']}")

    if primary == INTENT_SYSTEM_SCORES or flags.get("wants_scores"):
        if fields.get("SYSTEM_SCORES"):
            lines.append(f"Evidence scores: {fields['SYSTEM_SCORES']}")
        if fields.get("SCORE_SCOPE"):
            lines.append(f"Score scope: {fields['SCORE_SCOPE']}")
        lines.append(
            "These scores measure revenue-intelligence evidence readiness, not local Ollama quality. "
            "ML F with insufficient_labels is correct fail-closed, not a bug to fix with a new stack."
        )

    if primary == INTENT_NEXT_MONEY or primary == INTENT_IMPROVE:
        if fields.get("NEXT_MONEY"):
            lines.append(f"Next money action: {fields['NEXT_MONEY']}")
        lines.append(
            "Immediate improvement (grounded): re-export the deterministic snapshot before acting "
            "(live health + billing readbacks refresh the card); ship the day's ThumbGate.app "
            "campaign beat with provider-verifiable permalinks; never hard-code a price — read "
            "/api/billing/plan; cash counts only after a non-owner Stripe subscription payment."
        )
        lines.append(
            "Evidence pack: ~/.hermes/receipts/tinker-brain/* (eval, fingerprints, questions, "
            "economics) + ~/.hermes/receipts/thumbgate-aeo/latest.json + "
            "docs/RESEARCH-THUMBGATE-*.md in mac-yolo-safeguards."
        )

    if primary == INTENT_ECONOMICS:
        lines.append(
            "Model economics: default answer mode is deterministic card (zero model spend). "
            "Optional local Q4 Ollama is paraphrase-only and must pass the response contract. "
            "Paid remote training/LoRA stays gated until quality + expected-value gates pass. "
            "Hardware footprint is laptop/local; huge general LLMs are negative EV for this brain."
        )
        if fields.get("SYSTEM_SCORES"):
            lines.append(f"Evidence scores (for context only): {fields['SYSTEM_SCORES']}")

    if primary == INTENT_METHODS:
        lines.append(
            "Methods map for this brain: (1) rules router + deterministic card = primary architecture; "
            "(2) optional small transformer decoder only as constrained paraphraser; "
            "(3) LoRA/QLoRA only as supervised adapter on FAIL→PASS dumps, not open strategy; "
            "(4) quantization Q4/Q5 ok if numbers come from the card not the model; "
            "(5) distillation = teach card fidelity, not CEO consulting; "
            "(6) unsupervised MiniLM clusters = analytics sidecar only; "
            "(7) supervised purchase model = tabular after Stripe labels; "
            "(8) CNNs for vision, RNNs legacy — not for cash answers; "
            "(9) small models shine on routing, embeddings, tabular pay prediction, fail-closed gates."
        )
        lines.append(
            "Learning mode: supervised routing rules now; unsupervised clustering demoted from money ranker; "
            "no fitted purchase model until external paid labels exist."
        )

    if primary == INTENT_OFF_SCOPE:
        lines.append(
            "Off-scope refuse: vault cloud-sync projects, client-repo digressions (Upwork/Jeff/"
            "Hilltown), and generic stack rebuilds are not next cash. Primary product is "
            "ThumbGate.app; acquisition stays Skool/Reddit free-value → explicit buyer-intent → "
            "recoverable intake → Stripe."
        )
        if fields.get("NEXT_MONEY"):
            lines.append(f"Next money action: {fields['NEXT_MONEY']}")

    if primary == INTENT_GENERAL and fields.get("NEXT_MONEY"):
        lines.append(f"Next money action: {fields['NEXT_MONEY']}")

    if primary == INTENT_CASH and fields.get("NEXT_MONEY"):
        lines.append(f"Next money action: {fields['NEXT_MONEY']}")

    # SeqPU-style last settlement (on card even when route is general).
    if fields.get("LAST_RUN_RECEIPT") and fields.get("LAST_RUN_RECEIPT") != "none":
        if primary in {
            INTENT_CASH,
            INTENT_NEXT_MONEY,
            INTENT_IMPROVE,
            INTENT_GENERAL,
        }:
            lines.append(f"Last run receipt: {fields['LAST_RUN_RECEIPT']}")

    return "\n".join(lines) + "\n"


def answer(
    card_text: str,
    user_question: str,
    *,
    enforce_contract: bool = True,
    expert_text: str | None = None,
) -> dict[str, Any]:
    routing = route(user_question)
    text = render_from_route(card_text, user_question, routing, expert_text=expert_text)
    violations: list[str] = []
    if enforce_contract:
        violations = validate_response(text, card_text, user_question)
        if violations:
            # Fail closed: minimal cash-safe card dump
            fields = parse_card(card_text)
            text = (
                f"AS_OF={fields.get('AS_OF', 'not evidenced')}\n"
                f"Cash: external {_usd_field(fields, 'EXTERNAL_USD')}. "
                f"Owner/test {_usd_field(fields, 'OWNER_TEST_USD')} and is not revenue.\n"
                f"Why external cash is zero: {fields.get('WHY_ZERO', 'not evidenced')}\n"
                f"Provider evidence: {fields.get('PROVIDER_EVIDENCE', 'not evidenced')}\n"
                "Private conversion: blocked until an exact, current, provider-verified explicit "
                "request from the named person.\n"
                f"Next money action: {fields.get('NEXT_MONEY', 'publish free-value; no convert without intent')}\n"
                "Immediate improvement: deterministic person-bound evidence + golden contract; "
                "act only through a compliant Skool/Reddit rail.\n"
            )
            violations = validate_response(text, card_text, user_question)
    return {
        "ok": not violations,
        "violations": violations,
        "routing": routing,
        "answer_mode": "deterministic_card",
        "text": text,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--card", type=Path, required=True)
    parser.add_argument("--question", required=True)
    parser.add_argument("--expert-card", type=Path, default=None)
    parser.add_argument("--json", action="store_true")
    parser.add_argument("--no-enforce", action="store_true")
    args = parser.parse_args()
    card_text = args.card.read_text(encoding="utf-8")
    expert_text = load_expert_card(args.expert_card)
    result = answer(
        card_text,
        args.question,
        enforce_contract=not args.no_enforce,
        expert_text=expert_text,
    )
    if args.json:
        print(json.dumps(result, indent=2, sort_keys=True))
    else:
        sys.stdout.write(result["text"])
    return 0 if result["ok"] else 2


if __name__ == "__main__":
    raise SystemExit(main())
