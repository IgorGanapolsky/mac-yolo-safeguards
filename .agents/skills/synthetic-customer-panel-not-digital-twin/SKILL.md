---
name: synthetic-customer-panel-not-digital-twin
description: >
  Narrow behavioral simulation for one monetizable decision. Rank concrete
  hosted-VPS composer treatments with 5–20 evidence-backed personas; never
  claim the agents picked a winner. Holdout ranking first; fine-tune last.
  Inspired by Simile-style process (not a clone). Slash: /synthetic-customer-panel-not-digital-twin.
---

# Synthetic customer panel — not a digital twin

**Do not start by simulating everyone.** One intervention, one population, one
measurable outcome. Then rank alternatives and validate ranking direction.

This repo (mac-yolo / thumbgate.app/d):

```bash
node tools/synthetic-customer-panel.js
node tools/synthetic-customer-panel.js --json
node tests/test-synthetic-customer-panel.js
```

Panel: `evals/synthetic-customer-panel/panel.json`  
Spec: `evals/synthetic-customer-panel/SPEC.md`

Decision here: which Hermes-tab treatment maximizes `qualified_hosted_vps_send`
on a signed-in phone. Complementary to ThumbGate PR #3649 (landing angles).
Do not dual-edit that PR or `lib/experiments.ts`.

## NEVER / ALWAYS

| NEVER | ALWAYS |
| --- | --- |
| "The agents say Variant B wins" | "B is predicted for [segment] because [mechanism]; validate with a 10–20% traffic split" |
| Treat simulated ranks as observed conversion | `modeledNotMeasured` until holdout pairwise ranking passes |
| Fine-tune before evaluation | Prompt/heuristic + retrieved public evidence first |
| Dual-edit ThumbGate #3649 or D1 `experiments.ts` | Keep this runner complementary |
| Invent A/B results or $499 Diagnostic lift | Outcome = qualified hosted-VPS send; ECI still pauses paid-pilot outreach |
| Build a persona OS / Smallville clone | 5–20 archetypes, 3 variants, deterministic scenario runner |
| Hero Continuity / RUN ON / Mac-pair as the winning treatment | Hosted VPS default |

## Holdout gate

Live promotion of a ranking requires `kind=observed` labels, ≥5 holdout pairs,
and pairwise accuracy ≥ 0.7. Fixtures may prove the math. They do not launch
the experiment.
