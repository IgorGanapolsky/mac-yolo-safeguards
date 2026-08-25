---
name: hosted-agentic-watt
description: >
  NVIDIA Vera Rubin / Blackwell AgentX process steal for thumbgate.app: replay
  agentic turns (tool-call gaps, growing context), session context-reuse analog,
  tokens-per-watt vs interactivity. Not Vera Rubin, AgentX, Dynamo, or NVL72.
  Slash: /hosted-agentic-watt.
---

# Hosted agentic watt (not NVIDIA)

Source: [NVIDIA Vera Rubin and Blackwell Set a New Standard for Agentic AI Performance per Watt](https://developer.nvidia.com/blog/nvidia-vera-rubin-and-blackwell-set-a-new-standard-for-agentic-ai-performance-per-watt/) (2026-08-24).

thumbgate.app is $10 hosted 1:1 VPS chat on a Cloudflare Worker. Steal the **mechanic**, not the GPU rack.

```bash
node tools/hosted-agentic-watt.js --demo --json
node tools/hosted-agentic-watt.js --grade FILE.json --json
node tests/test-hosted-agentic-watt.js
npx vitest run lib/hosted-agentic-watt.test.ts
```

## Steal

1. **Replay agentic turns, not static 8K/1K chat** — AgentX dropped fixed sequence length. Hosted receipts classify tool calls / growing context as `agentic` and keep **tool-call gaps out of decode time**.
2. **Session context-reuse analog** — Dynamo credits KV overlap. Later turns credit `min(prev.promptTokens, current.promptTokens)` as reused; only the delta is billed prefill.
3. **Tokens-per-watt vs interactivity** — high tokens/watt is **UNUSABLE** if any turn E2E exceeds the 90s fenced lease. Unit is `tokens_per_watt_hour_vps_proxy` at **15W**, never NVIDIA tokens/MW.

## Skip

| Skip | Why |
|------|-----|
| Vera Rubin / Blackwell / GB300 / NVL72 | Hardware we do not run |
| SemiAnalysis AgentX live numbers | Their benchmark, not ours |
| NVIDIA Dynamo / TensorRT-LLM / SGLang / NVLink | GPU serving stack |
| `tools/nvidia-nemo-switchyard.js` | Sibling T-NVIDIA-NEMO-SWITCHYARD |
| `DashboardClient.tsx` | AGENT-476 / open dashboard PRs |
| $499 SKU | ECI uncleared |

`workerLive` stays false until this lands on `main` and the Worker is deployed.
Do not claim production LIVE from unit tests or an unmerged PR.

GATE: employment_ip_counsel — continued via hosted honesty receipts (pre-existing $10 VPS), not net-new agent-governance SKU and not paid outreach.
