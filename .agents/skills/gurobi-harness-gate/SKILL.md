---
name: gurobi-harness-gate
description: >
  Session/process gate: Gurobi certifies $10 token-budget LP and exclusive
  adb/git_lock dispatch at session-start and agent-loop health. Proof receipts,
  not LLM guesses. Trigger: gurobi harness, session start proof, token budget
  gate, exclusive dispatch, certified allocation.
---

# Gurobi harness gate (process, not SKU)

Pulse: real decisions need proof. The solver already lives in
`tools/gurobi_fleet_lib.py`. This skill is the **process hook** so agents
do not vibe-route spend or collide on ADB / `.git/index.lock`.

## Commands

```bash
node tools/gurobi-harness-gate.js --json
node tools/gurobi-harness-gate.js --session-start
node tests/test-gurobi-harness-gate.js
node tools/gurobi-acceptance-bench.js --json
node tests/test-gurobi-acceptance-bench.js
node tools/gurobi-solver-touchpoints.js --json
node tests/test-gurobi-solver-touchpoints.js
bin/agent-loop --health --json   # observe.gurobi_proof
```

Wired from `tools/agent-session-start.js` (human `=== Gurobi proof ===` line)
and `bin/agent-loop` observe.

## What it certifies

| Check | Constraint |
|---|---|
| Token budget | allocated spend ≤ $10; `huge` ($12) excluded |
| Exclusive ADB | at most one of `e2e-a` / `e2e-b` |
| Receipt | `proof.certified_optimal` + `obj_bound` from gurobipy |

Never mock an optimum. Skip (do not fail the whole session) if gurobipy is missing.

## Phase One Champion Kit (2026-08-19)

Steal the **process**, not the sales kit. Do not copy Gurobi PDFs / Wiley book into git.

| Kit piece | What we took | What we did not |
|---|---|---|
| LLMs and Optimization | Four certificates: OPTIMAL, MIP gap, IIS, UNBOUNDED. LLM explains; solver proves. | Intelligence Hub product |
| Evaluating and Benchmarking | Frozen set + metrics + 3-seed mean/range + env log + heuristic vs solver | Commercial bake-off / paid trial / CPLEX bake |
| Quick Migration | Map touchpoints; swap only CLI/lib; keep models + session-start | AMPL/GAMS rewrite |
| Business case | Quantify one decision (token $10, exclusive ADB) | C-suite dollar theater / ThumbGate paid knapsack |

Frozen models live in `examples/gurobi/` (#1869). Bench: `tools/gurobi-acceptance-bench.js`. Touchpoints: `tools/gurobi-solver-touchpoints.js`.

## Not this skill

- Do not invent a Gurobi product SKU or Intelligence Hub clone.
- Do not ThumbGate paid outreach / expand hosted app (ECI).
- Do not edit `examples/gurobi/` or the CLI files owned by the CLI-harness lane.
