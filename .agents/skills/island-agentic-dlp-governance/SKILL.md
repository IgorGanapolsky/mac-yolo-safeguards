---
name: island-agentic-dlp-governance
description: >
  Island.io high-ROI process steal (not a browser clone): local DLP last-mile scrub,
  MCP/skill endpoint posture risk inventory, vibe-publish deploy confidence + say-yes
  receipts. ECI pauses net-new ThumbGate agent-governance SKUs. Trigger: island,
  island.io, agentic DLP, MCP risk inventory, vibe publishing, say-yes receipt.
  Slash: /island-agentic-dlp-governance.
---

# Island high-ROI steal (fleet ops)

**Source:** https://www.island.io/ · https://www.island.io/ai  
**Pitch we steal from:** enterprise AI workforce needs last-mile egress control, MCP/skill inventory with risk, and “say yes on your terms” publish receipts — not another dashboard.

## Honest fit

| Transfer | Do NOT rebuild |
|----------|----------------|
| Last-mile DLP scrub + receipts | Island Enterprise Browser / Extension / Network |
| MCP + skill risk inventory | Island MCP Gateway product / NHI IdP |
| Vibe-publish confidence gate | Hosted vibe-publish with SSO brokerage |
| Say-yes framing when allowing | Net-new ThumbGate governance SKU (ECI pause) |

## Commands

```bash
# 1) Last-mile DLP (scrub + block critical / say-yes when clean)
node tools/hermes-agentic-dlp-guard.js
node tests/test-hermes-agentic-dlp-guard.js

# 2) Agentic Endpoint Posture — MCP + skill risk bands
node tools/island-endpoint-posture.js --json
node tests/test-island-endpoint-posture.js

# 3) Vibe Publishing confidence before CF deploy
node tools/island-vibe-publish-gate.js --json
# then only if SAY_YES:
bash scripts/deploy-cloudflare-with-lock.sh
```

## Backlog (not this PR)

- Live MCP threat-intel kill switch (Island one-click block) — needs product lane + ECI clearance
- Browser-use MCP policy broker as a hosted control plane
- Token-spend “AI Experience & Cost Intelligence” productization (we already have $10/mo guards)

## Related

- `tools/mcp-health-check.js` · `docs/MCP-INVENTORY.md`
- `scripts/deploy-cloudflare-with-lock.sh`
- `/eci-thumbgate-ip-wall` · `/ona-last-mile` · `/high-roi-steal-and-finish`
