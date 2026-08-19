---
name: gurobi-decision-audit
description: >
  Beyond LLMs process steal: certified Gurobi allocation is not an execute
  license. Append-only audit + repeatability fingerprint. Human oversight for
  ADB/spend/send. Trigger: gurobi audit, execute license, decision intelligence,
  beyond LLMs, governance oversight.
---

# Gurobi decision audit (Beyond LLMs)

Podcast: Gurobi *Beyond LLMs* (Adam Dejans Jr / David O'Keefe, 2026-07-30).
Steal **process**, not Intelligence Hub / free-trial SKU.

Certified optimization is provable and repeatable. Session-start may **observe**
a certified $10 spend + exclusive ADB assignment. That is **not** permission to
launch ADB, spend cloud tokens, or send outreach.

```bash
node tools/gurobi-decision-audit.js --json
node tests/test-gurobi-decision-audit.js
# audit log: ~/.hermes/gurobi/evals/audit.jsonl
```

| Certificate | Observe | Execute ADB/send |
|---|---|---|
| OPTIMAL (certified) | yes | no unless `human_ok` |
| IIS / UNBOUNDED | yes (proof of no plan) | no |
| LLM plausible / uncertified | no | no |

Hooked from `tools/gurobi-harness-gate.js` after the solver receipt.

## Not this skill

- Do not clone Gurobi Intelligence Hub or pitch a 30-day trial.
- Do not ThumbGate paid outreach / expand hosted app (ECI).
- Do not treat `exclusive_adb_ok` as a Maestro/e2e start command.
