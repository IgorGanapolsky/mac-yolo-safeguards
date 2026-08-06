#!/usr/bin/env python3
"""Mechanistic Interpretability & Self-Healing Engine for tinker-brain.

Provides activation tracing, feature attribution, and self-improving / self-healing
loops for ThumbGate.app sales, GTM, marketing, and pricing decisions.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

_REPO_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(_REPO_ROOT / "tools" / "tinker-brain"))

from tinker_brain_router import (  # noqa: E402
    GTM_MARKETING_PATTERNS,
    GTM_POSITIONING_PATTERNS,
    GTM_PRICING_PATTERNS,
    GTM_SALES_PATTERNS,
    THUMBGATE_PATTERNS,
    route,
)

TRACE_LOG = _REPO_ROOT / "coordination" / "tinker-brain-interpretability-trace.jsonl"


def analyze_mechanistic_activations(query: str) -> dict[str, Any]:
    """Extracts feature activations, matched pattern offsets, and decision weights."""
    activations: dict[str, Any] = {}
    
    # 1. Primary Product Match (ThumbGate)
    tg_matches = [m.group(0) for pattern in THUMBGATE_PATTERNS for m in re.finditer(pattern, query, re.I)]
    activations["thumbgate_signal"] = {
        "active": len(tg_matches) > 0,
        "matches": tg_matches,
        "weight": 1.0 if tg_matches else 0.0,
    }

    # 2. Sub-intent Activations
    pos_matches = [m.group(0) for pattern in GTM_POSITIONING_PATTERNS for m in re.finditer(pattern, query, re.I)]
    price_matches = [m.group(0) for pattern in GTM_PRICING_PATTERNS for m in re.finditer(pattern, query, re.I)]
    mkt_matches = [m.group(0) for pattern in GTM_MARKETING_PATTERNS for m in re.finditer(pattern, query, re.I)]
    sales_matches = [m.group(0) for pattern in GTM_SALES_PATTERNS for m in re.finditer(pattern, query, re.I)]

    activations["sub_intents"] = {
        "positioning": {"active": len(pos_matches) > 0, "matches": pos_matches, "weight": round(len(pos_matches) * 0.25, 2)},
        "pricing": {"active": len(price_matches) > 0, "matches": price_matches, "weight": round(len(price_matches) * 0.25, 2)},
        "marketing": {"active": len(mkt_matches) > 0, "matches": mkt_matches, "weight": round(len(mkt_matches) * 0.25, 2)},
        "sales": {"active": len(sales_matches) > 0, "matches": sales_matches, "weight": round(len(sales_matches) * 0.25, 2)},
    }

    # 3. Overall Interpretability Attribution
    total_weight = sum(v["weight"] for v in activations["sub_intents"].values())
    confidence = min(1.0, 0.4 + total_weight) if activations["thumbgate_signal"]["active"] else (0.6 if total_weight > 0 else 0.2)

    return {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "query": query,
        "activations": activations,
        "confidence_score": round(confidence, 2),
        "interpretability_tree": {
            "node": "tinker_brain_router",
            "primary_feature": "thumbgate_signal" if activations["thumbgate_signal"]["active"] else "general_fallback",
            "active_sub_features": [k for k, v in activations["sub_intents"].items() if v["active"]],
        },
    }


def log_interpretability_trace(trace: dict[str, Any]) -> None:
    """Logs decision attribution trace for self-improving auditability."""
    TRACE_LOG.parent.mkdir(parents=True, exist_ok=True)
    with TRACE_LOG.open("a", encoding="utf-8") as fh:
        fh.write(json.dumps(trace) + "\n")


def self_heal_and_organize() -> dict[str, Any]:
    """Self-healing run: verifies health, syncs divergence, and returns state."""
    from tinker_brain_health import check
    health = check()
    healed = False
    
    if not health.get("ok"):
        for finding in health.get("findings", []):
            if finding.get("check") == "source-divergence":
                # Auto-heal: export snapshot
                try:
                    import subprocess
                    subprocess.run(["python3", str(_REPO_ROOT / "tools" / "tinker-brain" / "export_tinker_brain_snapshot.py")], check=True)
                    healed = True
                except Exception as err:
                    print(f"Self-heal failed: {err}", file=sys.stderr)

    return {
        "healed": healed,
        "health_post_heal": check() if healed else health,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Mechanistic Interpretability & Self-Healing for tinker-brain")
    parser.add_argument("query", nargs="?", help="User query to trace")
    parser.add_argument("--json", action="store_true", help="Output JSON trace")
    parser.add_argument("--heal", action="store_true", help="Run self-healing cycle")
    args = parser.parse_args()

    if args.heal:
        res = self_heal_and_organize()
        print(json.dumps(res, indent=2) if args.json else f"Self-healing complete. Healed: {res['healed']}, Health: {'OK' if res['health_post_heal']['ok'] else 'UNHEALTHY'}")
        return 0 if res['health_post_heal']['ok'] else 1

    query = args.query or "How do we position Thumbgate.app pricing and sales motion against competitors?"
    routing = route(query)
    trace = analyze_mechanistic_activations(query)
    trace["routing"] = routing
    log_interpretability_trace(trace)

    if args.json:
        print(json.dumps(trace, indent=2))
    else:
        print(f"🧠 Mechanistic Interpretability Trace for: '{query}'")
        print(f"  Confidence Score: {trace['confidence_score']}")
        print(f"  Primary Feature: {trace['interpretability_tree']['primary_feature']}")
        print(f"  Active Sub-features: {', '.join(trace['interpretability_tree']['active_sub_features']) or 'none'}")
        print("  Activations:")
        for k, v in trace["activations"]["sub_intents"].items():
            if v["active"]:
                print(f"    - [{k.upper()}] weight={v['weight']} (matches: {v['matches']})")

    return 0


if __name__ == "__main__":
    sys.exit(main())
