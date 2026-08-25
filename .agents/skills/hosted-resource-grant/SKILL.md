---
name: hosted-resource-grant
description: >
  InfoQ Cloudflare OS process steal for thumbgate.app: agents start with
  zero resource grants, reads are observed, sharing fails unless the
  recipient already has those grants, fields are masked, destructive
  actions need HITL. Not Cloudflare OS, not workerd Gadgets, not Oak &
  Sparrow Gatekeeper. Slash: /hosted-resource-grant.
---

# Hosted resource grants (mechanic, not Cloudflare OS)

Source: https://www.infoq.com/news/2026/08/cloudflare-os-ai-platform-secure/
(Cloudflare OS open-source capability model, Aug 2026).

MCP ambient ("the agent can call GitHub") is not a resource grant. Sharing
a thread/dashboard that observed `d1:customers` must not leak that table to
someone who cannot read it directly.

```bash
node tools/hosted-resource-grant.js --honesty --json
node tools/hosted-resource-grant.js --evaluate --resource github:repo:x --grants '[]' --json
node tools/hosted-resource-grant.js --share --observed '[{"resourceId":"d1:customers"}]' --recipient-grants '[]' --json
node tests/test-hosted-resource-grant.js
```

| NEVER | ALWAYS |
|-------|--------|
| Clone Cloudflare OS / workerd / Gadgets / AI Gateway | Slim grant + observe + share CLI |
| Name this Gatekeeper (Oak & Sparrow collision) | `hosted-resource-grant` |
| Dual-edit #2033 / #2020 / cloud-tool-policy / hosted-tool-approvals | Complementary doctor |
| $499 / net-new governance SKU | Hosted VPS $10; `counselClearance=false` |
| Hero Continuity / Mac-pair | Fenced VPS chat |

## 1–3 tactics stolen

1. Zero ambient — empty grants deny every resource.
2. Observation follows the artifact — share-time recipient check.
3. Field mask + destructive HITL on thumbgate.app.

Backlog (not this PR): Dynamic Worker isolates, Cap'n Web RPC, live dashboard wiring, Cloudflare AI Gateway.
