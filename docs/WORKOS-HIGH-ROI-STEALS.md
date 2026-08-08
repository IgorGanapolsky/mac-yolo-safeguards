# WorkOS newsletter → free high-ROI steals (not a purchase)

**Source:** WorkOS Gmail newsletter *New this month* (2026-08-04): Atlas, `@workos/emulate`, MCP plugin, Pipes API keys, Radar.

**Policy:** ThumbGate already uses **WorkOS AuthKit Production** under a hard **≤ $10/mo** cap (`docs/WORKOS-PRODUCTION-SPEND-CAP.md`, `tools/workos-production-guard.js`). We **do not** buy Atlas, Radar enterprise, custom domains, or Directory Sync. We **steal patterns** into hermes-yolo, thumbgate.app, and Hermes Mobile.

## How this helps us

| WorkOS product | What it does for *them* | What we steal | Product payoff |
|----------------|-------------------------|---------------|----------------|
| **@workos/emulate** | Local API + seed known state + inject 429/5xx/invalid grant | `tools/hermes-known-state-emulate.js` | CI for pair redeem, gate approve, health green/red **without live Mac/phone** |
| **Atlas scoped agents** | Named Slack agents with job + tool scopes | Already in `hermes-yolo-sprawl-control` roles; MCP admin roles below | Less agent thrash; right toolsets per job |
| **MCP plugin + team access** | Manage env via MCP; admins gate prod | `tools/hermes-mcp-admin-access.js` | Reader can status; only admin + explicit flag mutates production |
| **Pipes API keys** | Managed credentials (API key or OAuth same vend path); rotate once | `tools/hermes-managed-credentials.js` | Fleet providers (LiteLLM, xAI, Baseten labels) vend without code caring about type; **no secrets in git** |
| **Radar** | Abuse signals on User Management APIs | `tools/hermes-abuse-radar.js` | Score pair-code brute force / multi-device spam → allow/challenge/block |
| **AuthKit (already paid-cap)** | Hosted login for thumbgate.app | Keep production guard + $10 cap | Public auth stays production, Google + email, no staging drift |

## Commands

```bash
# Known-state pair/gate scenarios (mobile CI gold)
node tools/hermes-known-state-emulate.js --demo --json
node tests/test-hermes-known-state-emulate.js

# Managed credential handles (labels only)
node tools/hermes-managed-credentials.js --list --json
node tests/test-hermes-managed-credentials.js

# MCP-style admin RBAC
node tools/hermes-mcp-admin-access.js --matrix --json
node tests/test-hermes-mcp-admin-access.js

# Pair abuse scoring
node tools/hermes-abuse-radar.js --demo --json
node tests/test-hermes-abuse-radar.js

# Existing production AuthKit guard (live thumbgate.app)
node tools/workos-production-guard.js
```

## What we deliberately skip

- Buying WorkOS Atlas / Radar / custom AuthKit domains
- Running public traffic on Staging AuthKit
- Agent-initiated spend or “upgrade plan” credential flows (hard deny in MCP matrix)

## Related

- `tools/workos-emulator-harness.js` — thin AuthKit token failure injection (sibling PR)
- `docs/WORKOS-PRODUCTION-SPEND-CAP.md` — live AuthKit topology + spend rules
- `tools/hermes-yolo-sprawl-control.js` — Atlas-like role catalog (Architect/Voyager/Perf/Nexus)
