---
name: hosted-tower-last-mile
description: >
  MotherDuck/Tower process steal for thumbgate.app: you cannot rent a foundation;
  agents write code, last mile is sandbox+schedule+credentials; hosted runs get a
  stable job URL. Not Tower.dev, not MotherDuck, not DuckDB, not Flights.
  Slash: /hosted-tower-last-mile.
---

# Hosted last-mile (not Tower.dev)

Source: [The New Stack, 2026-08-25](https://thenewstack.io/motherduck-tower-acquisition-python/)
— MotherDuck acquired Tower because agents could write connectors but could not
sandbox, schedule, or own the runtime. Quote to steal: **you can rent a feature,
but you can't rent a foundation.**

We are not Tower, MotherDuck, DuckDB, or Flights. Hosted Hermes is $10/mo chat
on a fenced VPS.

```bash
node tools/hosted-tower-last-mile.js --json
node tools/hosted-tower-last-mile.js --demo --json
node tests/test-hosted-tower-last-mile.js
npx vitest run lib/hosted-last-mile.test.ts
```

## Steal

1. **Cannot rent a foundation** — if an agent inside thumbgate.app builds a job,
   the executor is our product. A Tower/Mac/E2B logo on that runtime is rented.
2. **Last mile ≠ generated code** — sandbox + schedule + bound credentials.
   Chat text is not a pipeline.
3. **Stable job URL** — `https://thumbgate.app/dashboard?task=<id>`. The receipt
   is read-only (no prompt, no secrets).

## Skip

| Skip | Why |
|------|-----|
| Tower Control / Python pipeline SaaS | Not our SKU |
| MotherDuck / DuckDB / Flights / Dives | Warehouse product |
| Buying a runtime vendor | We already own the fenced VPS |
| `tools/ona-last-mile-placement.js` | Ona Mac+phone last mile |
| `execution-receipt.ts` | academy/together attach |
| $499 SKU / paid outreach | ECI uncleared |

`workerLive` and `liveClaim` stay false until this lands on `main` and the Worker
is deployed. Do not claim LIVE from unit tests.
