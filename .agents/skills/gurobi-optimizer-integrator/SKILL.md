---
name: gurobi-optimizer-integrator
description: >
  Real Gurobi (gurobipy) AI-guided mathematical optimization for fleet
  scheduling, AHLS outreach batch selection, token budget allocation, and
  feasibility audits. Free pip size-limited license first (AE Fabrizio
  Ellis 2026-08-12). Trigger: gurobi, optimize schedule, mathematical
  optimization, dispatch agents, outreach capacity knapsack, token budget,
  feasibility audit, IIS diagnosis.
---

# Gurobi optimizer (system-wide, real)

## Core Paradigm: Probabilistic Plausibility vs. Mathematical Proof

| Decision Domain | Pure LLM Approach (Plausible) | Gurobi + AI Harness (Certified Proof) |
|---|---|---|
| **Fleet Agent Dispatch** | LLM guesses which tasks to run on Mac mini vs Laptop | Job-Shop MIP: provably optimal DAG minimizing makespan without lock contention |
| **Outreach Batching** | LLM picks 15 random prospects that "sound promising" | 0-1 Multi-Choice Knapsack: maximizes expected deal value under rate limits |
| **Token Budget Allocation** | LLM vibe-routes models, easily exceeding $10/mo caps | Bounded LP: guarantees $0.00 marginal spend beyond ceiling |
| **Feasibility Audits** | LLM says "looks feasible!" and fails midway | Irreducible Inconsistent Subsystem (IIS): proves infeasibility or returns exact conflicting constraints |

## Mathematical Formulations

### A. Fleet Agent Dispatch (MIP)

$$\min \sum \text{Latency} \quad \text{s.t.} \quad \sum \text{RAM}_i \le 64\text{GB}, \quad \text{Concurrency}_{\text{ADB}} \le 1, \quad \text{Dependencies}(i, j) \le 0$$

Decision variables: `x[task, agent]` ∈ {0, 1} — whether task is assigned to agent.
Constraints: agent capacity, skill matching, max tasks per agent, dependency ordering.
Objective: maximize total priority-weighted task value.

### B. Outreach Batching (0-1 Multi-Choice Knapsack)

$$\max \sum \text{Propensity}_i \times \text{DealSize}_i \quad \text{s.t.} \quad \sum \text{CostUnits}_i \le \text{DailyCapacity}, \quad \sum_{v \in \text{vertical}} x_i \le \text{MaxPerVertical}_v$$

Decision variables: `x[prospect]` ∈ {0, 1} — whether prospect is selected.
Constraints: daily capacity, industry vertical caps, bounce risk threshold.
Objective: maximize total expected conversion value.

### C. Token Budget Allocation (Bounded LP / Binary Integer)

$$\max \sum \big(\text{LocalScore}_i + (\text{FrontierScore}_i - \text{LocalScore}_i) \cdot x_i\big) \quad \text{s.t.} \quad \sum \text{FrontierCost}_i \cdot x_i \le \text{BudgetUSD}$$

Decision variables: `x[workload]` ∈ {0, 1} — whether frontier paid model is routed.
Constraints: monthly spend ceiling ($10.00), marginal spend ≤ $0.00 beyond cap.
Objective: maximize total reasoning quality across all workloads.

### D. Feasibility Audits (IIS Diagnosis)

Given an infeasible model, Gurobi computes the **Irreducible Inconsistent Subsystem (IIS)** — the minimal set of constraints and variable bounds that are mutually contradictory. The solver returns:
- `iis_constraints`: conflicting constraints
- `iis_lower_bounds`: conflicting lower bound variables
- `iis_upper_bounds`: conflicting upper bound variables

This proves infeasibility mathematically rather than relying on heuristic validation.

## AI-Guided Optimization Pattern

1. **LLM as the Translator** — ingests messy human instructions, git diffs, and customer requirements; converts them into structured JSON parameters (variables, bounds, costs).
2. **Gurobi as the Prover** — evaluates billions of combinatorial possibilities in milliseconds to find the provably global optimum.
3. **Hermes as the Explainer** — LLM translates the mathematical solution back into plain-English receipts for the user and phone UI.

## Truth

- **Solver:** `gurobipy` 13.x via `~/.hermes/gurobi-venv` (also system python3.14)
- **License:** size-limited free pip — non-production; ≤2000 vars/constraints
- **AE path:** Fabrizio Ellis / Jue Xue for full trial when models grow
- **Never mock** random "optimal" values

## Commands

```bash
bin/gurobi-fleet license --json
bin/gurobi-fleet evaluate --json
bin/gurobi-fleet solve --file model.json --json
bin/guobi-fleet dispatch --file jobs.json --json
bin/gurobi-fleet outreach --file prospects.json --capacity 15 --json
bin/gurobi-fleet diagnose --file model.json --json
bin/gurobi-fleet token-budget --file workloads.json --budget 10 --json
bin/gurobi-mcp   # MCP stdio server
```

## MCP tools

- `gurobi_license_info`
- `gurobi_solve_lp`
- `gurobi_agent_dispatch`
- `gurobi_outreach_batch`
- `gurobi_diagnose_iis`
- `gurobi_token_budget`
- `gurobi_evaluate`

## Examples

```bash
# LP solve (diet-style)
bin/gurobi-fleet solve --file examples/gurobi/lp-model.json --json

# Fleet agent dispatch
bin/gurobi-fleet dispatch --file examples/gurobi/dispatch-jobs.json --json

# Outreach batching (knapsack)
bin/gurobi-fleet outreach --file examples/gurobi/outreach-prospects.json --json

# IIS diagnosis (infeasible model)
bin/gurobi-fleet diagnose --file examples/gurobi/infeasible-model.json --json

# Token budget allocation ($10 ceiling)
bin/gurobi-fleet token-budget --file examples/gurobi/token-budget-workloads.json --json
```

## Integration

- Install/re-sync: `bash tools/gurobi-systemwide-install.sh`
- Lib: `tools/gurobi_fleet_lib.py`
- CLI: `tools/gurobi-fleet-optimize.py`
- MCP: `tools/gurobi-mcp-server.py` (registered in `.mcp.json` as `gurobi`)
- Examples: `examples/gurobi/` (5 model files for all 5 subcommands)
- Docs: `docs/GUROBI-SYSTEMWIDE-20260812.md`
- Shell: `~/.hermes/gurobi/env.sh` (PATH helpers)
- Proof: `~/.hermes/gurobi/evals/latest.json` + `node tests/test-gurobi-fleet-optimize.js`

## Enterprise Credibility

> "Our fleet couples frontier LLMs with Gurobi certified mathematical optimization for provably optimal resource allocation and zero-violation constraint enforcement."

## When size-limited fails

Escalate to Fabrizio for full trial — do not invent solutions.
