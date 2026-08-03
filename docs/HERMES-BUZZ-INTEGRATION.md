# Hermes × Buzz / Nostr integration (three paths)

**Priority source:** [Nous Research ships three integration paths for Hermes Agent and Buzz Blocks…](https://www.marktechpost.com/2026/07/31/nous-research-ships-three-integration-paths-for-hermes-agent-and-buzz-blocks-open-source-nostr-workspace-for-humans-and-agents/) (MarkTechPost, 2026-07-31), plus primary projects:

| Project | Org | Role |
|---------|-----|------|
| [Hermes Agent](https://github.com/NousResearch/hermes-agent) | Nous Research | Self-improving agent: CLI, messaging gateway, ACP |
| [Buzz](https://github.com/block/buzz) | Block (open source) | Nostr-backed workspace for humans + agents |

**No affiliation** is claimed with Nous Research or Block.

## Three paths in *this* monorepo

| # | Path id | What it is here | Verify |
|---|---------|-----------------|--------|
| 1 | `local_cli` | Mac-local gateway, pair, hermes-yolo | artifacts + doctor |
| 2 | `control_plane` | ThumbGate.app + Hermes Mobile remote | ACP transformer present |
| 3 | `buzz_nostr` | NIP-01 signed events → ACP → Hermes task | real Schnorr verify |

```bash
node tools/hermes-integration-paths.js list
node tools/hermes-integration-paths.js doctor
node tools/hermes-integration-paths.js demo-nostr-acp --json
node tools/buzz-nostr-bridge.js   # public keys only; nsec hidden by default
```

## Crypto contract (anti false-green)

The previous `buzz-nostr-bridge.js` used SHA-256 “pubkeys”, fake `npub1…` prefixes, and **HMAC** signatures. That is **not** Nostr — relays reject it.

Current implementation:

- **BIP-340 Schnorr** via `@noble/secp256k1`
- **NIP-19** bech32 `npub` / `nsec` via `@scure/base`
- **NIP-01** event id = `sha256(json([0,pubkey,created_at,kind,tags,content]))`
- **verifyNostrEvent** before parse / ACP map
- **No nsec print** unless `HERMES_NOSTR_PRINT_NSEC=1`
- Seed keys require `allowInsecureSeed:true` (tests only)

## ACP bridge

`apps/hermes-control-plane/lib/acp-transformer.ts` maps ACP messages ↔ Hermes tasks.
`nostrEventToAcpMessage` in `tools/buzz-nostr-bridge.js` feeds that path after verification.

Upstream pattern (for operators running full Buzz):  
`Buzz channel → community relay → buzz-acp → hermes acp`  
([hermes-buzz-bridge](https://github.com/btcjon/hermes-buzz-bridge) tutorial).

This repo implements the **protocol slice** (identity, signed events, ACP shape, doctor) so agents cannot ship theater crypto.

## Tests

```bash
node tests/test-hermes-buzz-integration.js
node tools/hermes-integration-paths.js --self-test
```
