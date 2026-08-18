#!/usr/bin/env python3
"""
ElevenLabs Conversational Voice Agent & ThumbGate Governance Engine.
Provides Voice-Agent-as-Code GitOps, Multi-LLM Cost Estimation, Conversational Testing,
and ThumbGate Pre-Action Interdiction.
"""

import sys
import os
import json
import argparse
from typing import Dict, Any, List, Optional

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
                    "instruct the caller to confirm on their phone screen."
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
            "max_cost_per_conversation_usd": 0.05,
            "block_destructive_deletions": True,
        },
    },
}


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

    # Sort by total cost ascending
    comparisons.sort(key=lambda x: x["total_cost_usd"])
    cheapest = comparisons[0]
    most_expensive = comparisons[-1]
    savings_percent = round(
        ((most_expensive["total_cost_usd"] - cheapest["total_cost_usd"]) / most_expensive["total_cost_usd"]) * 100,
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
            "details": f"Greeting is non-empty: '{first_message[:40]}...'",
        },
        {
            "name": "LLM Selection Validity",
            "passed": llm in MODEL_PRICING,
            "details": f"Model '{llm}' is recognized in safety pricing catalog.",
        },
        {
            "name": "Conciseness & Latency Constraint",
            "passed": ("concise" in prompt.lower() or "short" in prompt.lower() or "sentences" in prompt.lower()),
            "details": "Prompt contains spoken voice conciseness directives.",
        },
        {
            "name": "Safety Escalation Directive",
            "passed": ("confirm" in prompt.lower() or "phone" in prompt.lower() or "safety" in prompt.lower() or "screen" in prompt.lower()),
            "details": "Prompt includes operator phone confirmation instruction for risky actions.",
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
    cost_ceiling_usd: float = 0.05,
) -> Dict[str, Any]:
    """
    ThumbGate PreToolUse safety interdiction logic for ElevenLabs MCP tool calls.
    Blocks destructive actions (deletes, unverified prompt updates, expensive model switches).
    """
    destructive_actions = ["delete_agent", "remove_agent", "destroy_workspace"]
    mutation_actions = ["update_prompt", "modify_system_prompt", "swap_model", "update_agent"]

    if action in destructive_actions:
        if not is_operator_approved:
            return {
                "decision": "BLOCK",
                "action": action,
                "agent_id": agent_id,
                "reason": "Destructive voice agent deletion requires explicit phone Leash operator approval.",
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
                "reason": "Voice agent configuration changes require a passing conversational simulation test before deployment.",
                "intervention_type": "SIMULATION_TEST_REQUIRED",
            }
        if estimated_cost_usd > cost_ceiling_usd and not is_operator_approved:
            return {
                "decision": "BLOCK",
                "action": action,
                "agent_id": agent_id,
                "reason": f"Estimated conversation cost (${estimated_cost_usd:.4f}) exceeds safety ceiling (${cost_ceiling_usd:.4f}). Operator approval required.",
                "intervention_type": "COST_CEILING_EXCEEDED",
            }
        return {
            "decision": "ALLOW",
            "action": action,
            "agent_id": agent_id,
            "reason": "Simulation tests passed and cost is within safety threshold.",
        }

    # Safe read-only tool calls (get_transcript, list_agents, check_status)
    return {
        "decision": "ALLOW",
        "action": action,
        "agent_id": agent_id,
        "reason": "Read-only voice agent inspection is safe.",
    }


def main():
    parser = argparse.ArgumentParser(
        description="ElevenLabs Conversational Voice Agent & ThumbGate Governance Suite"
    )
    subparsers = parser.add_subparsers(dest="command", help="Available commands")

    # Command: audit
    subparsers.add_parser("audit", help="Run comprehensive audit of voice agent governance")

    # Command: cost-estimate
    cost_parser = subparsers.add_parser("cost-estimate", help="Estimate multi-LLM conversation costs")
    cost_parser.add_argument("--calls", type=int, default=100, help="Number of simulated calls (default: 100)")
    cost_parser.add_argument("--minutes", type=float, default=3.0, help="Average minutes per call (default: 3.0)")
    cost_parser.add_argument("--json", action="store_true", help="Output JSON result")

    # Command: test-agent
    test_parser = subparsers.add_parser("test-agent", help="Run conversational simulation test on config")
    test_parser.add_argument("--config", type=str, help="Path to voice agent JSON/YAML config")
    test_parser.add_argument("--json", action="store_true", help="Output JSON result")

    # Command: gate-check
    gate_parser = subparsers.add_parser("gate-check", help="Evaluate ThumbGate pre-action safety on a tool call")
    gate_parser.add_argument("--action", required=True, help="Proposed action (e.g. delete_agent, update_prompt)")
    gate_parser.add_argument("--agent-id", required=True, help="Target voice agent ID")
    gate_parser.add_argument("--sim-pass", action="store_true", help="Simulation test passed")
    gate_parser.add_argument("--approved", action="store_true", help="Human Leash approval granted")
    gate_parser.add_argument("--cost", type=float, default=0.01, help="Estimated per-conversation cost")
    gate_parser.add_argument("--json", action="store_true", help="Output JSON result")

    # Command: export-template
    subparsers.add_parser("export-template", help="Export default voice agent template")

    args = parser.parse_args()

    if not args.command or args.command == "audit":
        cost_report = calculate_conversation_costs(num_conversations=100, avg_minutes_per_conv=3.0)
        sim_report = simulate_conversation_test(DEFAULT_VOICE_AGENT_TEMPLATE)
        gate_report = evaluate_thumbgate_pre_action("delete_agent", "hermes_voice_receptionist_v1", False, False)

        print("=== ElevenLabs Conversational Voice Agent & ThumbGate Governance Suite ===")
        print(f"Status: READY | Models Cataloged: {len(MODEL_PRICING)} | Simulation Harness: ACTIVE")
        print(f"Cost Arbitrage: {cost_report['analysis']['cheapest_model']} saves {cost_report['analysis']['max_savings_percent']}% vs {cost_report['analysis']['flagship_model']}")
        print(f"Sample Agent Test: {sim_report['status']} ({sim_report['tests_passed']}/{sim_report['tests_run']} passed)")
        print(f"ThumbGate Interdiction Check: {gate_report['decision']} on destructive '{gate_report['action']}' -> {gate_report['reason']}")
        return 0

    if args.command == "cost-estimate":
        report = calculate_conversation_costs(
            num_conversations=args.calls,
            avg_minutes_per_conv=args.minutes,
        )
        if args.json:
            print(json.dumps(report, indent=2))
        else:
            print(f"=== Multi-LLM Voice Cost Estimate ({args.calls} calls, {args.minutes} min avg) ===")
            print(f"{'Model':<20} {'Provider':<22} {'TTFT':<10} {'Cost/Call':<12} {'Total':<10}")
            print("-" * 75)
            for m in report["models"]:
                print(
                    f"{m['model']:<20} {m['provider']:<22} {str(m['avg_ttft_ms']) + 'ms':<10} "
                    f"${m['cost_per_conversation_usd']:<11.4f} ${m['total_cost_usd']:<9.2f}"
                )
            print("-" * 75)
            print(f"Optimal Choice: {report['analysis']['cheapest_model']} saves {report['analysis']['max_savings_percent']}% vs {report['analysis']['flagship_model']}")
        return 0

    if args.command == "test-agent":
        config = DEFAULT_VOICE_AGENT_TEMPLATE
        if args.config and os.path.exists(args.config):
            with open(args.config, "r", encoding="utf-8") as f:
                config = json.load(f)

        result = simulate_conversation_test(config)
        if args.json:
            print(json.dumps(result, indent=2))
        else:
            print(f"=== Conversational Simulation Test: {result['agent_id']} ===")
            print(f"Result: {result['status']} ({result['tests_passed']}/{result['tests_run']} passed)")
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
            decision_color = "ALLOW (PASSED)" if result["decision"] == "ALLOW" else "BLOCK (INTERCEPTED)"
            print(f"=== ThumbGate PreToolUse Gate Check: {args.action} ===")
            print(f"Decision: {decision_color}")
            print(f"Target:   {result['agent_id']}")
            print(f"Reason:   {result['reason']}")
        return 0 if result["decision"] == "ALLOW" else 1

    if args.command == "export-template":
        print(json.dumps(DEFAULT_VOICE_AGENT_TEMPLATE, indent=2))
        return 0

    return 0


if __name__ == "__main__":
    sys.exit(main())
