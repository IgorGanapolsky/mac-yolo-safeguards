---
name: cloudflare-developer-stack
description: >
  High-ROI Cloudflare developer-docs doctor for this repo: Markdown for Agents
  (Accept: text/markdown), wrangler/quickAction audit, AI crawl policy split,
  contextual 403 documentation_url. Never clone Workers AI, Agents SDK, or
  Wallets. Trigger: developers.cloudflare.com, markdown for agents, llms.txt,
  AI Crawl Control, wrangler compatibility_date. Slash: /cloudflare-developer-stack.
---

# Cloudflare developer stack (mechanics, not products)

Source: https://developers.cloudflare.com/

```bash
node tools/cloudflare-developer-stack.js --health --json
node tools/cloudflare-developer-stack.js --catalog --json
node tools/cloudflare-developer-stack.js --audit --json
node tools/cloudflare-developer-stack.js --crawl-policy --path /dashboard --json
node tools/cloudflare-developer-stack.js --docs --product workers --json
node tests/test-cloudflare-developer-stack.js
```

| NEVER | ALWAYS |
|-------|--------|
| Enable `observability.traces` (billable) | Keep traces unset; logs sample=1 |
| Clone Workers AI / AI Gateway / Vectorize / Agents SDK | LiteLLM + ThumbGate RAG + this doctor |
| Claim Pay Per Crawl or x402 LIVE | WAITLIST |
| Feed `/dashboard` to GPTBot | AEO allow public content only |
| Hero Continuity / Mac-pair | Hosted VPS product lock |

Markdown fetch uses `Accept: text/markdown` and reads `x-markdown-tokens` / `x-original-tokens` / `content-signal`.
403-shaped errors include `documentation_url` (Cloudflare contextual-403 steal).
Browser Run `quickAction` needs `compatibility_date >= 2026-03-24` — we ship `2026-07-20`.
