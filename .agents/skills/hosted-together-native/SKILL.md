---
name: hosted-together-native
description: >
  Together AI Native Conf process steal for thumbgate.app: capacity ≠ frontier,
  serverless/batch/provisioned/dedicated honesty, research-to-production receipts.
  Not Together Cloud, not FlashAttention-4, not ThunderAgent, not Instant Clusters.
  Slash: /hosted-together-native.
---

# Hosted Together Native (not Together Cloud)

Source: Together AI Gmail 2026-08-25 (`~/Downloads/together.pdf`) —
"See how AI-native teams build in production" / AI Native Conf.
Pitch: AI-native companies need **more than capacity**; they need to stay
at the frontier. Inspired by, not affiliated; do not copy conference decks.

thumbgate.app is $10 hosted 1:1 VPS chat on a Cloudflare Worker. Steal the
**mechanic**, not the GPU cloud.

```bash
node tools/hosted-together-native.js --json
node tools/hosted-together-native.js --demo --json
node tests/test-hosted-together-native.js
npx vitest run lib/hosted-together-native.test.ts
```

## Steal

1. **Capacity ≠ frontier** — leftover `$10` quota or `vpsUp` is not a LIVE
   production claim. Together's own email says teams need more than capacity.
2. **Workload class** — map Together's serverless / batch / provisioned /
   dedicated split onto hosted VPS: interactive chat, async eval, paid SLA,
   GPU-cluster (never offered). Batch complete ≠ LIVE. Dedicated always
   `NOT_OFFERED`.
3. **Research-to-production receipt** — a conference talk or together.ai blog
   is not production. LIVE needs a named repo eval artifact + 40-char deploy
   SHA + testsPass + workerLive.

## Already mapped (do not reinvent)

| Together idea | Existing rail |
|---------------|----------------|
| Artifact chain | `/ai-native-sdlc` (do not dual-edit) |
| completed ≠ quality | `/hosted-academy-4d` PR #2088 (do not dual-edit) |
| July customer stories | `docs/RESEARCH-together-cursor-decagon-hedra-2026-07.md` (read-only) |

## Skip

| Skip | Why |
|------|-----|
| Together Cloud / Instant Clusters | Not our product |
| FlashAttention-4 / ThunderKittens / Megakernel | GPU kernel R&D |
| ThunderAgent / RL API / ATLAS-2 | Not a $10 Worker |
| Fine-tune / dedicated container inference | Backlog |
| $499 SKU | ECI uncleared |
| `tools/ai-native-sdlc.js` | Sibling Anthropic SDLC steal |
| `execution-receipt.ts` | PR #2088 owns academy4d attach |

`workerLive` stays false until this lands on `main` and the Worker is deployed.
Do not claim production LIVE from unit tests or an unmerged PR.
