# Weekly KPI decision loop (ThumbGate.app Continuity)

**Product when the podcast hit:** ThumbGate.app Continuity SaaS (not affiliate EPC, not generic consulting).  
**Goal:** Turn scoreboards into **decisions + tickets**, not observation.

Inspired by Domo/Vibe/Umbex weekly business-review practice: each KPI has a *question*, thresholds, and a playbook; the review **must** end in ≤5 actions.

## Commands

```bash
# Human-readable review + tickets
node tools/weekly-kpi-decision-loop.js

# Machine JSON
node tools/weekly-kpi-decision-loop.js --json

# Offline (CI / no network probes for billing)
node tools/weekly-kpi-decision-loop.js --offline --json

# Persist under ~/.hermes/receipts/kpi-weekly/
node tools/weekly-kpi-decision-loop.js --write
```

Config: [`config/kpi-weekly-loop.json`](../config/kpi-weekly-loop.json)  
CI unit: `node tests/test-weekly-kpi-decision-loop.js`

## The 5 KPIs

| KPI | Decision question | Red trigger (default) |
|-----|-------------------|------------------------|
| External Continuity cash | Did a non-owner pay Stripe? | $0 fail-closed / no receipt |
| Campaign beat (14d LIVE) | Are we distributing with CTAs? | &lt; 3 LIVE-ish rows / 14d |
| Billing rails | Live `/api/billing/plan` OK? | unreachable / inactive |
| Funnel critical stages | Any critical GTM stage FAIL? | &gt; 1 critical fail |
| Retrieval ops | Grepae + lessons usable? | composite score &lt; 0.4 |

Every KPI has 3 playbook moves in the config (campaign beat, DP recruit, ensure grepae, etc.).

## Weekly protocol (30–45 min)

1. Run `node tools/weekly-kpi-decision-loop.js --write`
2. Read 🔴/🟡 only — ignore green vanity
3. For each ticket: run `command_hint` or equivalent; owner = agent+igor
4. Cap **5 actions** (config `max_actions_per_week`)
5. Next week: re-run; close tickets that moved the metric

## Automation hooks

- **Manual/agent:** session start or Monday review  
- **Optional LaunchAgent:** schedule  
  `node tools/weekly-kpi-decision-loop.js --write --json`  
  log to `~/Library/Logs/weekly-kpi-decision-loop.log`
- Pairs with: `ceo-operating-brief.js`, `funnel-stage-health.js`, `revenue-autonomous-loop.js`, `social-campaign-ds.js`

## What this is not

- Not a Domo/Looker product  
- Not inventing cash or AOV from empty Stripe  
- Not affiliate EPC scoreboard (wrong product)

## 7-day sprint (already partially done in-repo)

| Day | Action | Status |
|-----|--------|--------|
| 1 | Choose 3–5 KPIs + questions + thresholds | **Done** (config) |
| 2 | Micro playbooks per KPI | **Done** (config playbook[]) |
| 3 | Single weekly review surface | **Done** (this tool) |
| 4 | Alerts / write receipts | **Done** (`--write`) |
| 5 | First review → tickets | Run `--write` now |
| 6–7 | Execute tickets; refine playbooks | You + agents |
