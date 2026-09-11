---
name: hosted-sprites-format-not-sku
description: >
  Fly.io Sprites/SBD newsletter FORMAT steal, not the SKU. Never buy
  sprites.dev/mcp, sprites-py, SBD, or phoenix.new. Map reach/receipt/checkpoint
  onto the existing igor-hermes-cloud-runner Machine. Slash: /hosted-sprites-format-not-sku.
---

# Hosted Sprites FORMAT, not the SKU

Source: Fly.io newsletter 2026-09-10 + https://fly.io/blog/sprites-mcp/

Sprites are persistent Firecracker computers with MCP at `sprites.dev/mcp`.
SBD presents S3 as a kernel block device and runs ext4. **We do not buy that.**

Our product is one always-on Fly Machine `igor-hermes-cloud-runner` + $10/mo
hosted chat. phoenix.new is a Phoenix IDE, not a VPS upgrade.

```bash
node bin/hosted-sprites-format doctor --json
node bin/hosted-sprites-format route "pip install sprites-py"
node tests/test-hosted-sprites-format.js
```

## Stolen FORMAT (mapped)

| Fly Sprites | Ours |
|-------------|------|
| Point any MCP client at sprites.dev/mcp | Probe `thumbgate.app/api/health` + Fly `/health` (`probe_not_live_e2e`) |
| File as MCP resource, not a paste wall | `publicRunReceipt.resourceRef` (task id, never the prompt) |
| SBD checkpoint = S3 as disk | D1 persist-before-live + inbound claim heartbeat |

## NEVER / ALWAYS

| NEVER | ALWAYS |
|-------|--------|
| `npm install @fly/sprites` / `pip install sprites-py` | Keep the one Machine started |
| Enable SBD private beta | `SPRITES_SKU_FORBIDDEN` |
| Claim LIVE from a health curl | `probe_not_live_e2e` |
| Treat Sprites as the hosted VPS | `igor-hermes-cloud-runner` |
| Buy phoenix.new / extra Fly SKUs | `/fly-waste-guard` |

Complementary: `/hosted-computer-stack` (not OpenClaw/E2B), `/fly-waste-guard`.
