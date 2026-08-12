# Gurobi system-wide setup (2026-08-12)

**Source:** `~/Downloads/gurobi.pdf` — Gmail thread *Re: Gurobi evaluation*  
**From:** Fabrizio Ellis (Account Executive, Gurobi) → Igor  
**CC:** Jue Xue  

**AE path (literal):** free **pip `gurobipy`** first while building models; issue a **full Gurobi trial** when solves exceed size limits.

## Live license (evaluated on this Mac)

| Field | Value |
|-------|--------|
| Package | `gurobipy` **13.0.2** |
| Mode | **Restricted / size-limited** (non-production) |
| Limits | ≤2000 vars, ≤2000 linear constraints, ≤200 quadratic vars |
| Eval suite | `lp_diet_style` + `agent_dispatch` + `outreach_batch` + `license_probe` |
| Proof file | `~/.hermes/gurobi/evals/latest.json` (`ok: true`, 4/4) |
| Venv | `~/.hermes/gurobi-venv` |
| CLI/MCP home | `~/.hermes/gurobi/` (PATH via `~/.local/bin` + `env.sh`) |

When you hit size limits → email **Fabrizio Ellis** / **Jue Xue** for full trial.  
Calendly: https://calendly.com/d/ctn3-5zn-ykz/gurobi-call

## Install / re-sync (system-wide)

```bash
# From repo root (worktree or main)
bash tools/gurobi-systemwide-install.sh
```

Installs/upgrades:

1. Dedicated venv `~/.hermes/gurobi-venv` + `gurobipy>=13`
2. Durable copies under `~/.hermes/gurobi/` (survives worktree deletion)
3. `~/.local/bin/gurobi-fleet` and `gurobi-mcp` symlinks
4. `~/.hermes/gurobi/env.sh` + idempotent `~/.zshrc` source line
5. Grok skill mirror `~/.grok/skills/gurobi-optimizer-integrator/`
6. Hermetic eval → `~/.hermes/gurobi/evals/latest.json`

## Commands

```bash
# System PATH (after install)
gurobi-fleet license --json
gurobi-fleet evaluate --json
gurobi-fleet dispatch --file /path/jobs.json --json
gurobi-fleet outreach --file /path/prospects.json --capacity 15 --json
gurobi-mcp   # MCP stdio

# Repo-local wrappers (same API)
bin/gurobi-fleet evaluate --json
node tests/test-gurobi-fleet-optimize.js
```

## MCP registration (`.mcp.json`)

```json
"gurobi": {
  "command": "/Users/igorganapolsky/.hermes/gurobi/bin/gurobi-mcp",
  "args": []
}
```

System home path is intentional so every agent (any worktree) hits the same real solver.

### MCP tools

| Tool | Purpose |
|------|---------|
| `gurobi_license_info` | License probe + AE contact path |
| `gurobi_solve_lp` | Generic LP/MIP from JSON |
| `gurobi_agent_dispatch` | Task→agent assignment (priority/skills/capacity) |
| `gurobi_outreach_batch` | Prospect knapsack under daily capacity |
| `gurobi_evaluate` | Hermetic 4-case suite |

## Fleet use cases (real solves, not mocks)

1. **Agent dispatch** — assign tasks to agents by priority/skills/capacity  
2. **Outreach batch** — pick AHLS prospects under daily capacity (draft-only send policy still applies)  
3. **Generic LP/MIP** — JSON model file for ad-hoc optim

## Honesty

- Free pip license is **non-production** and size-limited  
- Do **not** claim unlimited commercial Gurobi or production deployment  
- Do **not** claim Gurobi is “in production” for ThumbGate (see memory mistake capture)  
- Prior JS “optimization engine” branches that reimplemented knapsack without gurobipy are **not** this stack  
- This stack uses **real gurobipy**; solutions are solver-optimal under free-pip limits

## Resources (from AE email / PDF)

- Getting Started: https://support.gurobi.com/hc/en-us/articles/360039862834  
- Support / Community / Gurobot: https://gurobi.com/gurobot  
- AE: fabrizio.ellis@gurobi.com · 619-218-5098  
- CC: jue.xue@gurobi.com  
- Calendly: https://calendly.com/d/ctn3-5zn-ykz/gurobi-call

## Repo layout

| Path | Role |
|------|------|
| `tools/gurobi_fleet_lib.py` | Core solvers + eval |
| `tools/gurobi-fleet-optimize.py` | CLI |
| `tools/gurobi-mcp-server.py` | MCP stdio |
| `tools/gurobi-systemwide-install.sh` | System install |
| `tools/gurobi-requirements.txt` | pip pin |
| `bin/gurobi-fleet` / `bin/gurobi-mcp` | Repo wrappers |
| `tests/test-gurobi-fleet-optimize.js` | Integration test |
| `.agents/skills/gurobi-optimizer-integrator/` | Agent skill |
