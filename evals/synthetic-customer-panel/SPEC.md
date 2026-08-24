# Simulation spec — hosted VPS send (not a digital twin)

**Date:** 2026-08-24  
**Owner:** grok  
**Complement:** ThumbGate PR #3649 ranks *landing* angles. This spec ranks *authenticated mobile composer* treatments. Do not dual-edit that PR or `apps/hermes-control-plane/lib/experiments.ts`.

## Decision (one)

| Field | Value |
| --- | --- |
| Intervention | Which `thumbgate.app/d` Hermes-tab treatment on a signed-in phone |
| Population | Signed-in mobile users (≈390×844) already in a Real Estate thread with synced assistant text and a 16/100 hosted-VPS meter |
| Outcome | `qualified_hosted_vps_send` — composer is reachable **and** the user submits a prompt to the fenced hosted VPS |
| Not the outcome | $499 Diagnostic, Continuity picker adoption, Mac-pair, email opt-in, “simulate everyone” |

## Constraints

- Hosted VPS is the default Continuity-class path. Do not hero a RUN ON / pair-Mac picker.
- ECI `counsel_clearance=false`: no paid-pilot / $499 outreach. Ranking is **modeledNotMeasured** until `kind=observed` holdout labels exist.
- Scorer is a labeled heuristic. Fine-tune only after mismatches from a real 10–20% traffic split.

## Evaluation metric

Pairwise ranking accuracy on holdout personas. Live promotion of a ranking requires `kind=observed` labels, ≥5 holdout pairs, accuracy ≥ 0.7. Fixture labels may prove the math; they do not launch traffic.

## Variants

1. `clip-cta` — live 2026-08-24 screenshot: “No web tasks in this chat yet” + purple “Write a task →”, 100dvh shell clips the textarea.
2. `composer-reachable` — PR #2043 CSS: hide empty-state CTA on Hermes tab, keep textarea in the visual viewport, hosted VPS default.
3. `continuity-picker` — restore Continuity / RUN ON / connect-Mac (explicitly **not** the product lock).

## Output contract

Not “the agents say Variant B wins.”  
Required shape: “`composer-reachable` is predicted for time-poor phone users already in a thread because it removes the clip that blocked the send; validate with a 10–20% traffic split vs `clip-cta`.”
