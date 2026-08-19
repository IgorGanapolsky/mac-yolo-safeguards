#!/usr/bin/env python3
"""Minimal MCP stdio server for Gurobi (JSON-RPC 2.0 / MCP tools).

Tools:
  gurobi_license_info
  gurobi_solve_lp
  gurobi_agent_dispatch
  gurobi_outreach_batch
  gurobi_evaluate

Uses real gurobipy — never mock solutions.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import Any

sys.path.insert(0, str(Path(__file__).resolve().parent))

from gurobi_fleet_lib import (  # noqa: E402
    diagnose_infeasibility_iis,
    license_info,
    optimize_agent_dispatch,
    optimize_outreach_batch,
    optimize_token_budget,
    run_evaluation,
    solve_lp,
)

SERVER_NAME = "gurobi-optimizer"
SERVER_VERSION = "1.1.0"


def _tool_list() -> list[dict[str, Any]]:
    return [
        {
            "name": "gurobi_license_info",
            "description": "Gurobi/gurobipy license probe + free-pip size limits + AE contact path",
            "inputSchema": {"type": "object", "properties": {}},
        },
        {
            "name": "gurobi_solve_lp",
            "description": "Solve LP/MIP: variables, constraints, linear objective (real gurobipy)",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "variables": {"type": "array"},
                    "constraints": {"type": "array"},
                    "objective": {"type": "object"},
                    "sense": {"type": "string", "default": "minimize"},
                    "time_limit": {"type": "number", "default": 30},
                },
                "required": ["variables", "constraints"],
            },
        },
        {
            "name": "gurobi_agent_dispatch",
            "description": "Assign tasks to agents maximizing priority under capacity/skills",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "tasks": {"type": "array"},
                    "agents": {"type": "array"},
                    "max_tasks_per_agent": {"type": "integer", "default": 3},
                },
                "required": ["tasks", "agents"],
            },
        },
        {
            "name": "gurobi_outreach_batch",
            "description": "Select outreach prospects maximizing score under daily capacity",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "prospects": {"type": "array"},
                    "daily_capacity": {"type": "integer", "default": 15},
                    "min_score": {"type": "number", "default": 0},
                },
                "required": ["prospects"],
            },
        },
        {
            "name": "gurobi_diagnose_iis",
            "description": "Compute Irreducible Inconsistent Subsystem (IIS) to diagnose contradictory constraints",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "variables": {"type": "array"},
                    "constraints": {"type": "array"},
                },
                "required": ["variables", "constraints"],
            },
        },
        {
            "name": "gurobi_token_budget",
            "description": "Optimize multi-tier model routing under hard monthly token spend ceiling ($10/mo)",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "workloads": {"type": "array"},
                    "monthly_budget_usd": {"type": "number", "default": 10.0},
                },
                "required": ["workloads"],
            },
        },
        {
            "name": "gurobi_evaluate",
            "description": "Run hermetic evaluation suite (license + LP + dispatch + outreach + IIS + budget)",
            "inputSchema": {"type": "object", "properties": {}},
        },
    ]


def _call_tool(name: str, arguments: dict[str, Any] | None) -> dict[str, Any]:
    args = arguments or {}
    if name == "gurobi_license_info":
        return license_info()
    if name == "gurobi_solve_lp":
        return solve_lp(
            variables=args.get("variables") or [],
            constraints=args.get("constraints") or [],
            objective=args.get("objective") or {},
            sense=args.get("sense") or "minimize",
            time_limit=float(args.get("time_limit") or 30),
        ).to_dict()
    if name == "gurobi_agent_dispatch":
        return optimize_agent_dispatch(
            tasks=args.get("tasks") or [],
            agents=args.get("agents") or [],
            max_tasks_per_agent=int(args.get("max_tasks_per_agent") or 3),
        ).to_dict()
    if name == "gurobi_outreach_batch":
        return optimize_outreach_batch(
            prospects=args.get("prospects") or [],
            daily_capacity=int(args.get("daily_capacity") or 15),
            min_score=float(args.get("min_score") or 0),
        ).to_dict()
    if name == "gurobi_diagnose_iis":
        return diagnose_infeasibility_iis(
            variables=args.get("variables") or [],
            constraints=args.get("constraints") or [],
        )
    if name == "gurobi_token_budget":
        return optimize_token_budget(
            workloads=args.get("workloads") or [],
            monthly_budget_usd=float(args.get("monthly_budget_usd") or 10.0),
        ).to_dict()
    if name == "gurobi_evaluate":
        return run_evaluation()
    raise ValueError(f"Unknown tool: {name}")



def _respond(msg_id: Any, result: Any) -> None:
    sys.stdout.write(json.dumps({"jsonrpc": "2.0", "id": msg_id, "result": result}) + "\n")
    sys.stdout.flush()


def _error(msg_id: Any, code: int, message: str) -> None:
    sys.stdout.write(
        json.dumps({"jsonrpc": "2.0", "id": msg_id, "error": {"code": code, "message": message}})
        + "\n"
    )
    sys.stdout.flush()


def handle(msg: dict[str, Any]) -> None:
    method = msg.get("method")
    msg_id = msg.get("id")
    params = msg.get("params") or {}

    # notifications (no id)
    if msg_id is None and method and method.startswith("notifications/"):
        return

    try:
        if method == "initialize":
            _respond(
                msg_id,
                {
                    "protocolVersion": params.get("protocolVersion") or "2024-11-05",
                    "capabilities": {"tools": {}},
                    "serverInfo": {"name": SERVER_NAME, "version": SERVER_VERSION},
                },
            )
            return
        if method == "tools/list":
            _respond(msg_id, {"tools": _tool_list()})
            return
        if method == "tools/call":
            name = params.get("name")
            arguments = params.get("arguments") or {}
            payload = _call_tool(name, arguments)
            _respond(
                msg_id,
                {
                    "content": [{"type": "text", "text": json.dumps(payload, indent=2, default=str)}],
                    "isError": not payload.get("ok", True) if isinstance(payload, dict) else False,
                },
            )
            return
        if method == "ping":
            _respond(msg_id, {})
            return
        _error(msg_id, -32601, f"Method not found: {method}")
    except Exception as e:
        _error(msg_id, -32000, str(e))


def main() -> None:
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            msg = json.loads(line)
        except json.JSONDecodeError:
            continue
        handle(msg)


if __name__ == "__main__":
    main()
