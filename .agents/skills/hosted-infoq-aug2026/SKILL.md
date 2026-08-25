---
name: hosted-infoq-aug2026
description: >
  InfoQ 2026-08-25 newsletter steal for thumbgate.app: cheap-first
  hosted safety cascade, MUST/SHOULD standards with
  guidance→observation→enforcement, WriteGuard-mapped critical
  intents default-deny. Not SafeChat, not Cloudflare Codex, not
  WriteGuard portal. Slash: /hosted-infoq-aug2026.
---

# Hosted InfoQ Aug 2026 cascade

Source: InfoQ weekly 2026-08-25 (SafeChat hybrid filter, Cloudflare
engineering-standards lifecycle, WriteGuard critical-tool deny).

ECI: `counsel_clearance=false`. Hosted product stays $10 VPS chat.

```bash
node tools/hosted-infoq-cascade.js --honesty --json
node tools/hosted-infoq-cascade.js --backtest --json
node tools/hosted-infoq-cascade.js --evaluate "git push --force origin main" --json
node tests/test-hosted-infoq-cascade.js
```

## Steal

1. Cheap deterministic filter before any expensive path (DoorDash SafeChat *shape*).
2. Standards are MUST/SHOULD with lifecycle `guidance` → `observation` → `enforcement`. Only `enforcement` withholds.
3. Critical writes (spend, force-push, production deploy, Photon/iMessage) default-deny on the fenced VPS.
4. Isolate each admission step so a throw fail-closes (Newman progressive-collapse). Durable-step analog — not Cloudflare CI.

## Skip

| Skip | Why |
|------|-----|
| DoorDash SafeChat | Marketplace moderation SKU |
| Cloudflare WriteGuard portal | Private beta; we already have `hermes-mcp-writeguard.js` |
| Cloudflare Codex AI reviewer | Not an LLM linter |
| Next.js 16.3 Instant Navigations | Control-plane is 16.2.x; upgrade is not this PR |
| Kitesurf | Sibling PRs #2010 / #2079 |
| hosted-resource-grant | OPEN PR #2069 |
| task-leases.ts claim-time cascade | Codex in_review; create-time still gated |

Live admission: `admitHostedInfoqCascade` after `evaluateCloudPromptToolPolicy` on `/api/tasks`, `/api/nostr/events`, and signed-device cloud create.
