# Cloudflare Agents Week → free high-ROI steals

**Source:** [Agents Week tag](https://blog.cloudflare.com/tag/agents-week/) (Aug 2026), especially:

- [The Agent Access Model](https://blog.cloudflare.com/the-agent-access-model/)
- [WriteGuard for MCP](https://blog.cloudflare.com/mcp-portal-writeguard-private-beta/)
- [Identity-aware AI Gateway](https://blog.cloudflare.com/identity-aware-ai-gateway/)

**Policy:** Steal patterns for hermes-yolo / ThumbGate / Hermes Mobile. Do **not** buy Cloudflare Wallets, x402 pay, or paid AI Gateway as agent spend. Control plane already runs on Workers where useful.

## How this helps us

| CF idea | Problem it names | Our steal | Product |
|---------|------------------|-----------|---------|
| **Agent Access Model** | Human Zero Trust fails quietly on agents; credentials outlive tasks | Task-scoped credentials + Trust Ratchet + harness mediation | **hermes-yolo** (every tool call) |
| **Prompt is not a perimeter** | "Don't touch prod" in the prompt is not enforcement | `authorizeAction` outside the model | ThumbGate narrative + real gates |
| **WriteGuard** | Joe's agent closed 1000 tickets under Joe's identity | Risk tiers, disable critical tools, agent attribution, audit | **MCP / Leash / mobile pair writes** |
| **Identity-aware analytics** | Machine-speed rogue behavior | Per-agent baselines + burst/critical flags | **fleet ops + ThumbGate product** |
| **Human oversight exceptional** | Approve-every-step fatigue | Critical tools disabled; human only for ceiling changes | Mobile Leash approvals |
| **Wallets / x402** | Agents that pay | **Hard deny** (`spend.authorize`, `wallet.pay`) | never-spend |

## Modules

| Module | Role |
|--------|------|
| `tools/hermes-agent-access-model.js` | Dispatch, short-lived task creds, ratchet, activity log, grant review |
| `tools/hermes-mcp-writeguard.js` | Per-tool risk, block-before-handler, attribution labels, audit |
| `tools/hermes-agent-identity-analytics.js` | Baselines + anomaly flags from local logs |

## Commands

```bash
node tools/hermes-agent-access-model.js --demo --json
node tools/hermes-agent-access-model.js --list-templates --json
node tools/hermes-mcp-writeguard.js --demo --json
node tools/hermes-mcp-writeguard.js --check --tool merge_mr --json
node tools/hermes-agent-identity-analytics.js --demo --json

node tests/test-hermes-agent-access-model.js
node tests/test-hermes-mcp-writeguard.js
node tests/test-hermes-agent-identity-analytics.js
```

## Deliberately skipped

- Cloudflare Wallets / autonomous payments
- Paid WriteGuard portal beta dependency
- Multiplayer access control (open research problem; we keep single-principal task graphs)
