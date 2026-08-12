---
name: gurobi-optimizer-integrator
description: >
  Real Gurobi (gurobipy) optimization for fleet scheduling, AHLS outreach
  batch selection, and LP/MIP. Free pip size-limited license first (AE Fabrizio
  Ellis 2026-08-12). Trigger: gurobi, optimize schedule, mathematical
  optimization, dispatch agents, outreach capacity knapsack.
---

# Gurobi optimizer (system-wide, real)

## Truth

- **Solver:** `gurobipy` 13.x via `~/.hermes/gurobi-venv` (also system python3.14)
- **License:** size-limited free pip — non-production; ≤2000 vars/constraints
- **AE path:** Fabrizio Ellis / Jue Xue for full trial when models grow
- **Never mock** random "optimal" values

## Commands

```bash
bin/gurobi-fleet license --json
bin/gurobi-fleet evaluate --json
bin/gurobi-fleet dispatch --file jobs.json --json
bin/gurobi-fleet outreach --file prospects.json --capacity 15 --json
bin/gurobi-mcp   # MCP stdio server
```

## MCP tools

- `gurobi_license_info`
- `gurobi_solve_lp`
- `gurobi_agent_dispatch`
- `gurobi_outreach_batch`
- `gurobi_evaluate`

## Integration

- Install/re-sync: `bash tools/gurobi-systemwide-install.sh`
- Lib: `tools/gurobi_fleet_lib.py`
- CLI: `tools/gurobi-fleet-optimize.py`
- MCP: `tools/gurobi-mcp-server.py` (registered in `.mcp.json` as `gurobi`)
- Docs: `docs/GUROBI-SYSTEMWIDE-20260812.md`
- Shell: `~/.hermes/gurobi/env.sh` (PATH helpers)
- Proof: `~/.hermes/gurobi/evals/latest.json` + `node tests/test-gurobi-fleet-optimize.js`

## When size-limited fails

Escalate to Fabrizio for full trial — do not invent solutions.
