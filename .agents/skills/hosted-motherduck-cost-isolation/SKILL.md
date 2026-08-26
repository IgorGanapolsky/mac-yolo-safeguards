---
name: hosted-motherduck-cost-isolation
description: >
  MotherDuck homepage process steal for thumbgate.app: a hosted-10 agent
  cannot escalate to Giga/warehouse SKUs; isolation is shared fenced VPS,
  not a per-agent Duckling; agent catalog is honest (no fuzzy warehouse MCP).
  Not MotherDuck, DuckDB, Ducklings, Flights, Dives, or JWT mint.
  Slash: /hosted-motherduck-cost-isolation.
---

# Hosted cost isolation (not MotherDuck)

Source: [MotherDuck homepage](https://motherduck.com/) — hypertenancy pitch
that every user/agent gets an isolated Duckling, idle-shutdown in 100ms, and
**cost isolation** so a Standard-tier agent cannot run up Giga prices.

We are not MotherDuck. Hosted Hermes is $10/mo chat on a **shared** fenced VPS.

```bash
node tools/hosted-motherduck-cost-isolation.js --json
node tools/hosted-motherduck-cost-isolation.js --demo --json
node tools/hosted-motherduck-cost-isolation.js --catalog --json
node tests/test-hosted-motherduck-cost-isolation.js
npx vitest run lib/hosted-cost-isolation.test.ts
```

## Steal

1. **Cost isolation** — bound SKU `hosted-10` ($10/mo). Giga / warehouse /
   Duckling / Flights / Dives requests are `NOT_OFFERED`. Spend above $10 fails
   `sku_cap_10`. Cross-tenant SKU escalation fails closed.
2. **Isolation mode** — `shared-fenced-vps`. Claiming a per-agent Duckling or
   100ms idle shutdown is a lie (`not_per_agent_duckling`,
   `idle_shutdown_not_duckling`).
3. **Agent catalog** — hosted chat + approvals + fenced VPS. Not MotherDuck MCP
   fuzzy warehouse catalog, SUMMARIZE/COMMENT guidelines, or Dives shares.

## Skip

| Skip | Why |
|------|-----|
| Ducklings / 100ms idle-shutdown | Not our compute |
| Flights Python jobs | PR #2123 last-mile analog |
| Dives viz / Iceberg / S3 warehouse | Warehouse product |
| `POST https://new.motherduck.com` JWT | Ephemeral warehouse trial |
| `tools/hosted-tower-last-mile.js` | Sibling last-mile PR |
| `hosted-source-of-truth.ts` / llms.txt route | Owned elsewhere |
| $499 SKU / paid outreach | ECI uncleared |

`workerLive` and `liveClaim` stay false until this lands on `main` and the
Worker is deployed. Do not claim LIVE from unit tests.
