#!/usr/bin/env python3
"""CLI for system-wide Gurobi fleet optimization (gurobipy).

Usage:
  gurobi-fleet-optimize.py license [--json]
  gurobi-fleet-optimize.py evaluate [--json]
  gurobi-fleet-optimize.py solve --file model.json [--json]
  gurobi-fleet-optimize.py dispatch --file jobs.json [--json]
  gurobi-fleet-optimize.py outreach --file prospects.json [--capacity N] [--json]
  gurobi-fleet-optimize.py diagnose --file model.json [--json]
  gurobi-fleet-optimize.py token-budget --file workloads.json [--budget N] [--json]
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

# Allow running from tools/ or installed path
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


def _load(path: str):
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description="Gurobi fleet optimizer (real gurobipy)")
    p.add_argument("cmd", choices=["license", "evaluate", "solve", "dispatch", "outreach", "diagnose", "token-budget"])
    p.add_argument("--file", help="JSON model/jobs/prospects/workloads file")
    p.add_argument("--capacity", type=int, default=15)
    p.add_argument("--budget", type=float, default=10.0, help="Monthly token budget in USD (default: $10.00)")
    p.add_argument("--json", action="store_true")
    args = p.parse_args(argv)

    if args.cmd == "license":
        out = license_info()
    elif args.cmd == "evaluate":
        out = run_evaluation()
    elif args.cmd == "solve":
        if not args.file:
            print("--file required", file=sys.stderr)
            return 2
        data = _load(args.file)
        r = solve_lp(
            variables=data["variables"],
            constraints=data["constraints"],
            objective=data.get("objective") or {},
            sense=data.get("sense", "minimize"),
            time_limit=float(data.get("time_limit", 30)),
        )
        out = r.to_dict()
    elif args.cmd == "dispatch":
        if not args.file:
            print("--file required", file=sys.stderr)
            return 2
        data = _load(args.file)
        r = optimize_agent_dispatch(
            tasks=data["tasks"],
            agents=data["agents"],
            max_tasks_per_agent=int(data.get("max_tasks_per_agent", 3)),
        )
        out = r.to_dict()
    elif args.cmd == "outreach":
        if not args.file:
            print("--file required", file=sys.stderr)
            return 2
        data = _load(args.file)
        prospects = data if isinstance(data, list) else data.get("prospects", [])
        r = optimize_outreach_batch(
            prospects=prospects,
            daily_capacity=int(data.get("capacity", args.capacity) if isinstance(data, dict) else args.capacity),
            min_score=float(data.get("min_score", 0) if isinstance(data, dict) else 0),
        )
        out = r.to_dict()
    elif args.cmd == "diagnose":
        if not args.file:
            print("--file required", file=sys.stderr)
            return 2
        data = _load(args.file)
        out = diagnose_infeasibility_iis(
            variables=data.get("variables", []),
            constraints=data.get("constraints", []),
        )
    elif args.cmd == "token-budget":
        if not args.file:
            print("--file required", file=sys.stderr)
            return 2
        data = _load(args.file)
        workloads = data if isinstance(data, list) else data.get("workloads", [])
        r = optimize_token_budget(
            workloads=workloads,
            monthly_budget_usd=float(data.get("monthly_budget_usd", args.budget) if isinstance(data, dict) else args.budget),
        )
        out = r.to_dict()

    if args.json or args.cmd in ("license", "evaluate", "solve", "dispatch", "outreach", "diagnose", "token-budget"):
        print(json.dumps(out, indent=2, default=str))
    return 0 if out.get("ok", True) is not False else 1


if __name__ == "__main__":
    raise SystemExit(main())
