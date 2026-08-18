#!/usr/bin/env python3
"""
ElevenLabs Conversational Voice Agent & ThumbGate Governance Engine.

High-ROI steals from ElevenLabs hosted MCP (TNS 2026-08-18):
1. Destructive actions (delete_agent) require phone Leash approval.
2. Cost estimate before model swap (chat confirm ≠ validated deploy).
3. Simulate conversation (incl. billing escalation) before promote.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from datetime import datetime, timezone
from typing import Any, Dict

# Standard LLM Pricing Table ($ / 1M tokens) & Latency Characteristics
MODEL_PRICING: Dict[str, Dict[str, Any]] = {
    "gemini-2.5-flash": {
        "provider": "Google",
        "input_per_million": 0.075,
        "output_per_million": 0.30,
        "avg_ttft_ms": 140,
        "recommended_for": "Ultra-low latency real-time voice",
    },
    "qwen-2.5-72b": {
        "provider": "Alibaba ModelStudio",
        "input_per_million": 0.12,
        "output_per_million": 0.24,
        "avg_ttft_ms": 180,
        "recommended_for": "High ROI Token Plan promo tier",
    },
    "glm-5.3": {
        "provider": "Zhipu AI",
        "input_per_million": 0.10,
        "output_per_million": 0.20,
        "avg_ttft_ms": 190,
        "recommended_for": "Zero marginal spend coding plan tier",
    },
    "gpt-4o-mini": {
        "provider": "OpenAI",
        "input_per_million": 0.15,
        "output_per_million": 0.60,
        "avg_ttft_ms": 220,
        "recommended_for": "Lightweight conversational tasks",
    },
    "gpt-4o": {
        "provider": "OpenAI",
        "input_per_million": 2.50,
        "output_per_million": 10.00,
        "avg_ttft_ms": 380,
        "recommended_for": "Complex reasoning / enterprise escalation",
    },
    "claude-3-5-sonnet": {
        "provider": "Anthropic",
        "input_per_million": 3.00,
        "output_per_million": 15.00,
        "avg_ttft_ms": 420,
        "recommended_for": "Deep context reasoning / code diagnosis",
    },
}

# Standard Voice Agent Template
DEFAULT_VOICE_AGENT_TEMPLATE = {
    "agent_id": "hermes_voice_receptionist_v1",
    "name": "Hermes Mobile Voice Receptionist",
    "version": "1.0.0",
    "conversation_config": {
        "agent": {
            "prompt": {
                "prompt": (
                    "You are Hermes, a helpful, ultra-concise voice assistant. "
                    "Always reply in 1-2 spoken sentences. If a risky command is requested, "
                    "instruct the caller to confirm on their phone screen. "
                    "Escalate billing disputes and payment issues to a human operator — "
                    "never invent refunds or charge outcomes."
                ),
                "llm": "gemini-2.5-flash",
                "temperature": 0.3,
                "max_tokens": 150,
            },
            "first_message": "Hello! I am Hermes. What can I help you with today?",
            "language": "en",
        },
        "tts": {
            "voice_id": "21m00Tcm4TlvDq8ikWAM",
            "model_id": "eleven_turbo_v2_5",
            "stability": 0.5,
            "similarity_boost": 0.8,
            "latency_optimization": 3,
        },
        "safety_guardrails": {
            "require_simulation_test_pass": True,
            "max_cost_per_conversation_usd": 0.20,
            "block_destructive_deletions": True,
        },
    },
}

BILLING_ESCALATION_MARKERS = (
    "billing",
    "dispute",
    "refund",
    "payment",
    "charge",
    "invoice",
)


def calculate_conversation_costs(
    num_conversations: int,
    avg_minutes_per_conv: float,
    turns_per_minute: int = 4,
    avg_input_tokens_per_turn: int = 350,
    avg_output_tokens_per_turn: int = 60,
    tts_cost_per_minute: float = 0.04,  # ElevenLabs Turbo average
) -> Dict[str, Any]:
    """Calculate cost comparisons across multiple LLM backends for conversational voice."""
    total_turns = int(num_conversations * avg_minutes_per_conv * turns_per_minute)
    total_minutes = num_conversations * avg_minutes_per_conv
    total_tts_cost = total_minutes * tts_cost_per_minute

    comparisons = []
    for model_name, specs in MODEL_PRICING.items():
        total_input_tokens = total_turns * avg_input_tokens_per_turn
        total_output_tokens = total_turns * avg_output_tokens_per_turn

        llm_input_cost = (total_input_tokens / 1_000_000) * specs["input_per_million"]
        llm_output_cost = (total_output_tokens / 1_000_000) * specs["output_per_million"]
        total_llm_cost = llm_input_cost + llm_output_cost
        total_all_in_cost = total_llm_cost + total_tts_cost
        cost_per_conversation = total_all_in_cost / max(1, num_conversations)
        cost_per_minute = total_all_in_cost / max(1, total_minutes)

        comparisons.append({
            "model": model_name,
            "provider": specs["provider"],
            "avg_ttft_ms": specs["avg_ttft_ms"],
            "llm_cost_usd": round(total_llm_cost, 4),
            "tts_cost_usd": round(total_tts_cost, 4),
            "total_cost_usd": round(total_all_in_cost, 4),
            "cost_per_conversation_usd": round(cost_per_conversation, 4),
            "cost_per_minute_usd": round(cost_per_minute, 4),
            "recommended_for": specs["recommended_for"],
        })

    comparisons.sort(key=lambda x: x["total_cost_usd"])
    cheapest = comparisons[0]
    most_expensive = comparisons[-1]
    savings_percent = round(
        ((most_expensive["total_cost_usd"] - cheapest["total_cost_usd"])
         / most_expensive["total_cost_usd"]) * 100,
        1,
    )

    return {
        "parameters": {
            "num_conversations": num_conversations,
            "avg_minutes_per_conv": avg_minutes_per_conv,
            "total_minutes": total_minutes,
            "total_turns": total_turns,
            "tts_cost_per_minute_usd": tts_cost_per_minute,
        },
        "models": comparisons,
        "analysis": {
            "cheapest_model": cheapest["model"],
            "cheapest_total_usd": cheapest["total_cost_usd"],
            "flagship_model": most_expensive["model"],
            "flagship_total_usd": most_expensive["total_cost_usd"],
            "max_savings_percent": savings_percent,
        },
    }


def compare_models(
    baseline: str,
    candidate: str,
    num_conversations: int = 100,
    avg_minutes_per_conv: float = 3.0,
) -> Dict[str, Any]:
    """Answer: 'What would my agent cost with candidate instead of baseline?'"""
    if baseline not in MODEL_PRICING:
        raise ValueError(f"Unknown baseline model: {baseline}")
    if candidate not in MODEL_PRICING:
        raise ValueError(f"Unknown candidate model: {candidate}")

    report = calculate_conversation_costs(num_conversations, avg_minutes_per_conv)
    by_model = {m["model"]: m for m in report["models"]}
    base = by_model[baseline]
    cand = by_model[candidate]
    delta = round(cand["cost_per_conversation_usd"] - base["cost_per_conversation_usd"], 4)
    pct = 0.0
    if base["cost_per_conversation_usd"] > 0:
        pct = round((delta / base["cost_per_conversation_usd"]) * 100, 1)

    return {
        "baseline": base,
        "candidate": cand,
        "delta_cost_per_conversation_usd": delta,
        "delta_percent_vs_baseline": pct,
        "recommendation": (
            f"Prefer {candidate}" if delta < 0 else f"Keep {baseline}"
            if delta > 0 else "Cost-neutral"
        ),
        "parameters": report["parameters"],
    }


def _has_billing_escalation(prompt: str) -> bool:
    lower = prompt.lower()
    has_marker = any(m in lower for m in BILLING_ESCALATION_MARKERS)
    has_human = any(w in lower for w in ("human", "operator", "escalate", "transfer", "person"))
    return has_marker and has_human


def simulate_conversation_test(config: Dict[str, Any]) -> Dict[str, Any]:
    """Simulate test suite against agent configuration to verify conversational reliability."""
    agent_cfg = config.get("conversation_config", {}).get("agent", {})
    prompt_cfg = agent_cfg.get("prompt", {})
    prompt = prompt_cfg.get("prompt", "")
    llm = prompt_cfg.get("llm", "")
    first_message = agent_cfg.get("first_message", "")

    test_cases = [
        {
            "name": "Initial Greeting Test",
            "passed": len(first_message.strip()) > 0,
            "details": "Greeting is non-empty.",
        },
        {
            "name": "LLM Selection Validity",
            "passed": llm in MODEL_PRICING,
            "details": f"Model '{llm}' is recognized in safety pricing catalog.",
        },
        {
            "name": "Conciseness & Latency Constraint",
            "passed": (
                "concise" in prompt.lower()
                or "short" in prompt.lower()
                or "sentences" in prompt.lower()
            ),
            "details": "Prompt contains spoken voice conciseness directives.",
        },
        {
            "name": "Safety Escalation Directive",
            "passed": (
                "confirm" in prompt.lower()
                or "phone" in prompt.lower()
                or "safety" in prompt.lower()
                or "screen" in prompt.lower()
            ),
            "details": "Prompt includes operator phone confirmation instruction for risky actions.",
        },
        {
            # TNS 2026-08-18: trimming prompts can silently drop billing escalation.
            "name": "Billing Dispute Escalation Retained",
            "passed": _has_billing_escalation(prompt),
            "details": (
                "Prompt still escalates billing/payment disputes to a human "
                "(chat confirm alone is not validation)."
            ),
        },
    ]

    all_passed = all(tc["passed"] for tc in test_cases)
    return {
        "status": "PASS" if all_passed else "FAIL",
        "agent_id": config.get("agent_id", "unknown"),
        "tests_run": len(test_cases),
        "tests_passed": sum(1 for tc in test_cases if tc["passed"]),
        "test_cases": test_cases,
    }


def evaluate_thumbgate_pre_action(
    action: str,
    agent_id: str,
    has_simulated_pass: bool = False,
    is_operator_approved: bool = False,
    estimated_cost_usd: float = 0.0,
    cost_ceiling_usd: float = 0.20,
) -> Dict[str, Any]:
    """
    ThumbGate PreToolUse safety interdiction for ElevenLabs MCP tool calls.
    Blocks destructive actions, unverified prompt updates, expensive model switches.
    """
    destructive_actions = ["delete_agent", "remove_agent", "destroy_workspace"]
    mutation_actions = [
        "update_prompt",
        "modify_system_prompt",
        "swap_model",
        "update_agent",
        "promote_config",
    ]

    if action in destructive_actions:
        if not is_operator_approved:
            return {
                "decision": "BLOCK",
                "action": action,
                "agent_id": agent_id,
                "reason": (
                    "Destructive voice agent deletion requires explicit "
                    "phone Leash operator approval."
                ),
                "intervention_type": "HUMAN_LEASH_REQUIRED",
            }
        return {
            "decision": "ALLOW",
            "action": action,
            "agent_id": agent_id,
            "reason": "Operator Leash approval verified for agent deletion.",
        }

    if action in mutation_actions:
        if not has_simulated_pass:
            return {
                "decision": "BLOCK",
                "action": action,
                "agent_id": agent_id,
                "reason": (
                    "Voice agent configuration changes require a passing "
                    "conversational simulation test before deployment."
                ),
                "intervention_type": "SIMULATION_TEST_REQUIRED",
            }
        if estimated_cost_usd > cost_ceiling_usd and not is_operator_approved:
            return {
                "decision": "BLOCK",
                "action": action,
                "agent_id": agent_id,
                "reason": (
                    f"Estimated conversation cost (${estimated_cost_usd:.4f}) exceeds "
                    f"safety ceiling (${cost_ceiling_usd:.4f}). Operator approval required."
                ),
                "intervention_type": "COST_CEILING_EXCEEDED",
            }
        return {
            "decision": "ALLOW",
            "action": action,
            "agent_id": agent_id,
            "reason": "Simulation tests passed and cost is within safety threshold.",
        }

    return {
        "decision": "ALLOW",
        "action": action,
        "agent_id": agent_id,
        "reason": "Read-only voice agent inspection is safe.",
    }


def promote_config(
    config: Dict[str, Any],
    *,
    action: str = "promote_config",
    is_operator_approved: bool = False,
    cost_ceiling_usd: float | None = None,
    dry_run: bool = True,
) -> Dict[str, Any]:
    """
    Atomic promote path: simulate → cost-estimate → gate-check.
    Chat confirmation alone never promotes; this receipt is the proof artifact.
    """
    agent_id = config.get("agent_id", "unknown")
    agent_cfg = config.get("conversation_config", {}).get("agent", {})
    prompt_cfg = agent_cfg.get("prompt", {})
    llm = prompt_cfg.get("llm", "gemini-2.5-flash")
    guardrails = (
        config.get("conversation_config", {}).get("safety_guardrails", {})
        or {}
    )
    ceiling = (
        cost_ceiling_usd
        if cost_ceiling_usd is not None
        else float(guardrails.get("max_cost_per_conversation_usd", 0.20))
    )

    sim = simulate_conversation_test(config)
    costs = calculate_conversation_costs(num_conversations=100, avg_minutes_per_conv=3.0)
    model_row = next((m for m in costs["models"] if m["model"] == llm), None)
    if model_row is None:
        estimated = 999.0
    else:
        estimated = float(model_row["cost_per_conversation_usd"])

    gate = evaluate_thumbgate_pre_action(
        action=action,
        agent_id=agent_id,
        has_simulated_pass=(sim["status"] == "PASS"),
        is_operator_approved=is_operator_approved,
        estimated_cost_usd=estimated,
        cost_ceiling_usd=ceiling,
    )

    promotable = gate["decision"] == "ALLOW" and sim["status"] == "PASS"
    receipt = {
        "promoted_at": datetime.now(timezone.utc).isoformat(),
        "dry_run": dry_run,
        "promotable": promotable,
        "agent_id": agent_id,
        "llm": llm,
        "estimated_cost_per_conversation_usd": estimated,
        "cost_ceiling_usd": ceiling,
        "simulation": sim,
        "gate": gate,
        "deploy_action": (
            "WOULD_PUSH_CONFIG" if promotable and dry_run
            else "PUSH_CONFIG" if promotable and not dry_run
            else "HOLD"
        ),
        "note": (
            "Chat confirmation is not validation — promote requires "
            "simulation PASS + gate ALLOW."
        ),
    }
    return receipt



def _public_sim_result(result: Dict[str, Any]) -> Dict[str, Any]:
    """JSON-safe sim result without prompt/greeting snippets (CodeQL clear-text)."""
    return {
        "status": result.get("status"),
        "agent_id": result.get("agent_id"),
        "tests_run": result.get("tests_run"),
        "tests_passed": result.get("tests_passed"),
        "test_cases": [
            {"name": tc.get("name"), "passed": tc.get("passed")}
            for tc in result.get("test_cases", [])
        ],
    }


def _public_promote_receipt(receipt: Dict[str, Any]) -> Dict[str, Any]:
    """JSON-safe promote receipt without embedded prompt text."""
    out = {
        "promoted_at": receipt.get("promoted_at"),
        "dry_run": receipt.get("dry_run"),
        "promotable": receipt.get("promotable"),
        "agent_id": receipt.get("agent_id"),
        "llm": receipt.get("llm"),
        "estimated_cost_per_conversation_usd": receipt.get(
            "estimated_cost_per_conversation_usd"
        ),
        "cost_ceiling_usd": receipt.get("cost_ceiling_usd"),
        "deploy_action": receipt.get("deploy_action"),
        "note": receipt.get("note"),
        "gate": {
            "decision": receipt.get("gate", {}).get("decision"),
            "action": receipt.get("gate", {}).get("action"),
            "intervention_type": receipt.get("gate", {}).get("intervention_type"),
            "reason": receipt.get("gate", {}).get("reason"),
        },
        "simulation": _public_sim_result(receipt.get("simulation", {})),
    }
    return out


def _load_config(path: str | None) -> Dict[str, Any]:
    if path and os.path.exists(path):
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    return DEFAULT_VOICE_AGENT_TEMPLATE


def main() -> int:
    parser = argparse.ArgumentParser(
        description="ElevenLabs Conversational Voice Agent & ThumbGate Governance Suite"
    )
    subparsers = parser.add_subparsers(dest="command", help="Available commands")

    subparsers.add_parser("audit", help="Run comprehensive audit of voice agent governance")

    cost_parser = subparsers.add_parser(
        "cost-estimate", help="Estimate multi-LLM conversation costs"
    )
    cost_parser.add_argument("--calls", type=int, default=100)
    cost_parser.add_argument("--minutes", type=float, default=3.0)
    cost_parser.add_argument("--json", action="store_true")

    cmp_parser = subparsers.add_parser(
        "compare-models",
        help="Compare per-conversation cost: baseline vs candidate (TNS MCP question)",
    )
    cmp_parser.add_argument("--baseline", default="gpt-4o")
    cmp_parser.add_argument("--candidate", default="gemini-2.5-flash")
    cmp_parser.add_argument("--calls", type=int, default=100)
    cmp_parser.add_argument("--minutes", type=float, default=3.0)
    cmp_parser.add_argument("--json", action="store_true")

    test_parser = subparsers.add_parser(
        "test-agent", help="Run conversational simulation test on config"
    )
    test_parser.add_argument("--config", type=str)
    test_parser.add_argument("--json", action="store_true")

    gate_parser = subparsers.add_parser(
        "gate-check", help="Evaluate ThumbGate pre-action safety on a tool call"
    )
    gate_parser.add_argument("--action", required=True)
    gate_parser.add_argument("--agent-id", required=True)
    gate_parser.add_argument("--sim-pass", action="store_true")
    gate_parser.add_argument("--approved", action="store_true")
    gate_parser.add_argument("--cost", type=float, default=0.01)
    gate_parser.add_argument("--json", action="store_true")

    promote_parser = subparsers.add_parser(
        "promote",
        help="Atomic promote: simulate → cost → gate (never chat-confirm alone)",
    )
    promote_parser.add_argument("--config", type=str)
    promote_parser.add_argument("--approved", action="store_true")
    promote_parser.add_argument("--apply", action="store_true", help="Not dry-run")
    promote_parser.add_argument("--ceiling", type=float, default=None)
    promote_parser.add_argument("--json", action="store_true")

    subparsers.add_parser("export-template", help="Export default voice agent template")

    args = parser.parse_args()

    if not args.command or args.command == "audit":
        cost_report = calculate_conversation_costs(100, 3.0)
        sim_report = simulate_conversation_test(DEFAULT_VOICE_AGENT_TEMPLATE)
        gate_report = evaluate_thumbgate_pre_action(
            "delete_agent", "hermes_voice_receptionist_v1", False, False
        )
        promote_report = promote_config(DEFAULT_VOICE_AGENT_TEMPLATE, dry_run=True)
        print("=== ElevenLabs Conversational Voice Agent & ThumbGate Governance Suite ===")
        print(
            f"Status: READY | Models Cataloged: {len(MODEL_PRICING)} | "
            "Simulation Harness: ACTIVE"
        )
        print(
            f"Cost Arbitrage: {cost_report['analysis']['cheapest_model']} saves "
            f"{cost_report['analysis']['max_savings_percent']}% vs "
            f"{cost_report['analysis']['flagship_model']}"
        )
        print(
            f"Sample Agent Test: {sim_report['status']} "
            f"({sim_report['tests_passed']}/{sim_report['tests_run']} passed)"
        )
        print(
            f"ThumbGate Interdiction Check: {gate_report['decision']} on destructive "
            f"'{gate_report['action']}' -> {gate_report['reason']}"
        )
        print(
            f"Promote Path: promotable={promote_report['promotable']} "
            f"deploy={promote_report['deploy_action']}"
        )
        return 0

    if args.command == "cost-estimate":
        report = calculate_conversation_costs(args.calls, args.minutes)
        if args.json:
            print(json.dumps(report, indent=2))
        else:
            print(
                f"=== Multi-LLM Voice Cost Estimate "
                f"({args.calls} calls, {args.minutes} min avg) ==="
            )
            print(f"{'Model':<20} {'Provider':<22} {'TTFT':<10} {'Cost/Call':<12} {'Total':<10}")
            print("-" * 75)
            for m in report["models"]:
                print(
                    f"{m['model']:<20} {m['provider']:<22} "
                    f"{str(m['avg_ttft_ms']) + 'ms':<10} "
                    f"${m['cost_per_conversation_usd']:<11.4f} "
                    f"${m['total_cost_usd']:<9.2f}"
                )
            print("-" * 75)
            print(
                f"Optimal Choice: {report['analysis']['cheapest_model']} saves "
                f"{report['analysis']['max_savings_percent']}% vs "
                f"{report['analysis']['flagship_model']}"
            )
        return 0

    if args.command == "compare-models":
        try:
            report = compare_models(
                args.baseline, args.candidate, args.calls, args.minutes
            )
        except ValueError as exc:
            print(f"ERROR: {exc}", file=sys.stderr)
            return 2
        if args.json:
            print(json.dumps(report, indent=2))
        else:
            print(
                f"=== Model Swap Cost Compare: {args.baseline} → {args.candidate} ==="
            )
            print(
                f"Baseline  {args.baseline}: "
                f"${report['baseline']['cost_per_conversation_usd']:.4f}/call"
            )
            print(
                f"Candidate {args.candidate}: "
                f"${report['candidate']['cost_per_conversation_usd']:.4f}/call"
            )
            print(
                f"Delta: ${report['delta_cost_per_conversation_usd']:.4f}/call "
                f"({report['delta_percent_vs_baseline']:+.1f}%)"
            )
            print(f"Recommendation: {report['recommendation']}")
        return 0

    if args.command == "test-agent":
        config = _load_config(args.config)
        result = simulate_conversation_test(config)
        if args.json:
            print(json.dumps(_public_sim_result(result), indent=2))
        else:
            print(f"=== Conversational Simulation Test: {result['agent_id']} ===")
            print(
                f"Result: {result['status']} "
                f"({result['tests_passed']}/{result['tests_run']} passed)"
            )
            for tc in result["test_cases"]:
                status_icon = "✓" if tc["passed"] else "✗"
                print(f"  [{status_icon}] {tc['name']}: {tc['details']}")
        return 0 if result["status"] == "PASS" else 1

    if args.command == "gate-check":
        result = evaluate_thumbgate_pre_action(
            action=args.action,
            agent_id=args.agent_id,
            has_simulated_pass=args.sim_pass,
            is_operator_approved=args.approved,
            estimated_cost_usd=args.cost,
        )
        if args.json:
            print(json.dumps(result, indent=2))
        else:
            decision_color = (
                "ALLOW (PASSED)" if result["decision"] == "ALLOW"
                else "BLOCK (INTERCEPTED)"
            )
            print(f"=== ThumbGate PreToolUse Gate Check: {args.action} ===")
            print(f"Decision: {decision_color}")
            print(f"Target:   {result['agent_id']}")
            print(f"Reason:   {result['reason']}")
        return 0 if result["decision"] == "ALLOW" else 1

    if args.command == "promote":
        config = _load_config(args.config)
        receipt = promote_config(
            config,
            is_operator_approved=args.approved,
            cost_ceiling_usd=args.ceiling,
            dry_run=not args.apply,
        )
        if args.json:
            print(json.dumps(_public_promote_receipt(receipt), indent=2))
        else:
            print(f"=== Promote Receipt: {receipt['agent_id']} ===")
            print(f"Promotable: {receipt['promotable']}")
            print(f"Deploy:     {receipt['deploy_action']} (dry_run={receipt['dry_run']})")
            print(
                f"LLM/cost:   {receipt['llm']} @ "
                f"${receipt['estimated_cost_per_conversation_usd']:.4f}/call "
                f"(ceiling ${receipt['cost_ceiling_usd']:.4f})"
            )
            print(
                f"Simulation: {receipt['simulation']['status']} "
                f"({receipt['simulation']['tests_passed']}/"
                f"{receipt['simulation']['tests_run']})"
            )
            print(
                f"Gate:       {receipt['gate']['decision']} — "
                f"{receipt['gate']['reason']}"
            )
            print(f"Note:       {receipt['note']}")
        return 0 if receipt["promotable"] else 1

    if args.command == "export-template":
        print(json.dumps(DEFAULT_VOICE_AGENT_TEMPLATE, indent=2))
        return 0

    return 0


if __name__ == "__main__":
    sys.exit(main())
