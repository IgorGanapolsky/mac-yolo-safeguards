---
name: gurobi-optimizer-integrator
description: >
  Real Gurobi (gurobipy) optimization for fleet scheduling, AHLS outreach
  batch selection, LP/MIP, IIS infeasibility proof, and $10/mo token-budget LP.
  Free pip size-limited license first (AE Fabrizio Ellis 2026-08-12).
  Trigger: gurobi, optimize schedule, mathematical optimization, dispatch
  agents, outreach capacity knapsack, IIS, token budget, certified proof.
---

# Gurobi optimizer (system-wide, real)

## Truth

- **Solver:** `gurobipy` 13.x via `~/.hermes/gurobi-venv` (also system python3.14)
- **License:** size-limited free pip — non-production; ≤2000 vars/constraints
- **AE path:** Fabrizio Ellis / Jue Xue for full trial when models grow
- **Never mock** random "optimal" values
- **Pulse steal (2026-08-19):** receipts carry `proof` (`obj_val`/`obj_bound`/`mip_gap`/`certified_optimal`). Infeasible models return IIS, not "looks feasible."

## Commands

```bash
bin/gurobi-fleet license --json
bin/gurobi-fleet evaluate --json
bin/gurobi-fleet dispatch --file jobs.json --json
bin/gurobi-fleet outreach --file prospects.json --capacity 15 --json
bin/gurobi-fleet iis --file model.json --json
bin/gurobi-fleet token-budget --file workloads.json --budget 10 --json
bin/gurobi-mcp   # MCP stdio server
```

## MCP tools

- `gurobi_license_info` — cached probe (do not re-license every solve)
- `gurobi_solve_lp` — LP/MIP + certified proof + auto-IIS on INFEASIBLE
- `gurobi_agent_dispatch` — priority MIP; `exclusive` tokens (`adb`,`git_lock`) ≤1; optional `ram_gb`
- `gurobi_outreach_batch` — knapsack; bounce_risk ≤0.05; max 2 per `vertical`; DRAFT-only
- `gurobi_evaluate` — 6 hermetic cases (LP, dispatch, outreach, license, IIS, token budget)
- `gurobi_diagnose_iis` — exact conflicting constraints
- `gurobi_token_budget` — binary local vs frontier under `$10` monthly ceiling

## Hybrid pattern (LLM front-end, solver back-end)

1. LLM parses messy intent → JSON variables/bounds/costs.
2. Gurobi proves OPTIMAL (or returns IIS). Never accept a vibe schedule.
3. Hermes/CLI prints the receipt (`proof.certified_optimal`, dual bound, spend).

## ECI / Chief fences

- Outreach batches are **DRAFT-only**. Not ThumbGate paid-pilot acquisition.
- Do not invent a Gurobi SKU, Intelligence Hub clone, or enterprise "certified optimization" product claim.
- Token LP enforces the hosted Hermes **$10/mo** spend ceiling; it does not expand the hosted app.

## Did not steal

- Gurobi Intelligence Hub product
- Full 64GB job-shop DAG / Mac-mini vs laptop warehouse MIP
- ThumbGate buyer knapsack under ECI pause

## Integration

- Install/re-sync: `bash tools/gurobi-systemwide-install.sh`
- Lib: `tools/gurobi_fleet_lib.py`
- CLI: `tools/gurobi-fleet-optimize.py`
- MCP: `tools/gurobi-mcp-server.py` (registered in `.mcp.json` as `gurobi`, v1.1.0)
- Docs: `docs/GUROBI-SYSTEMWIDE-20260812.md`
- Shell: `~/.hermes/gurobi/env.sh` (PATH helpers)
- Proof: `~/.hermes/gurobi/evals/latest.json` + `node tests/test-gurobi-fleet-optimize.js`

## When size-limited fails

Escalate to Fabrizio for full trial — do not invent solutions.
