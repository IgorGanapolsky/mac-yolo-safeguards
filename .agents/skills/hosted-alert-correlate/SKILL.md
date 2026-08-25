---
name: hosted-alert-correlate
description: >
  New Stack 2026-08-25 Digitate/ignio process steal for thumbgate.app:
  duplicate-signature suppression, related-route correlation, precursor
  before user-facing, validated-fix only. Not ignio, not CloudWatch.
  Slash: /hosted-alert-correlate.
---

# Hosted alert correlate (not ignio)

Source: The New Stack email 2026-08-25 (`~/Downloads/newstack.pdf`) — Digitate ignio
AIOps promo. IDC quote: multiple suppression types + correlation modes cut alert
noise; agentic reasoning suggests **validated** fixes.

thumbgate.app is a $10 hosted Worker, not an AIOps estate. Steal the **mechanic**:
collapse duplicate 5xx / client_error signatures, correlate `/api/tasks` +
`/api/nostr/events` into one admission incident, mark precursor vs user-facing,
never auto-apply a fix without tests+receipt.

```bash
node tools/hosted-alert-correlate.js --json
node tests/test-hosted-alert-correlate.js
npx vitest run lib/hosted-alert-correlate.test.ts lib/client-error-beacon.test.ts
```

ClientErrorBeacon on the hosted app now suppresses the same `errorClass` inside
a 60s window (plus the existing session cap).

## Skip

| Skip | Why |
|------|-----|
| ignio / Digitate / TCS | Not our product |
| AWS CloudWatch / Azure Monitor | We do not ingest those |
| Quote “90%” as our metric | Measure suppressRatio on a fixture |
| `tools/rule-sprawl.js` | Different TNS steal (OpenSearch) |
| $499 SKU | ECI uncleared |
