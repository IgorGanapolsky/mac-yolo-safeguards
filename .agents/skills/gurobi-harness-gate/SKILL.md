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

## Not this skill

- Do not invent a Gurobi product SKU or Intelligence Hub clone.
- Do not ThumbGate paid outreach / expand hosted app (ECI).
- Do not edit `examples/gurobi/` or the CLI files owned by the CLI-harness lane.
