---
name: cloudflare-kitesurf-browser
description: >
  Cloudflare Kitesurf via Browser Run (?browser=kitesurf) for agent screenshots
  and HTML extract. Fail-closed: never claim READY without CLOUDFLARE_ACCOUNT_ID
  + CLOUDFLARE_API_TOKEN. Fallback is fetch HTML, not a fake PNG. Trigger:
  Kitesurf, Browser Run, InfoQ kitesurf, lightweight agent browser.
  Slash: /cloudflare-kitesurf-browser.
---

# Cloudflare Kitesurf (Browser Run adapter)

Sources: https://blog.cloudflare.com/kitesurf/ · https://www.infoq.com/news/2026/08/cloudflare-kitesurf-browser/

Steal the **mechanic** (stateless browser for agents running on Cloudflare Workers, CDP-compatible, `browser=kitesurf`). Do **not** vendor Chromium. Kitesurf is **free beta** with per-account limits — not GA, no SLA.

**Does:** HTML/DOM parsing, JS execution, CSS via Stylo, screenshots, PDFs, CORS enforcement; passes 215,000+ WPT tests. Drop-in for Puppeteer / Playwright / chrome-remote-interface.

**Resource profile vs Chromium:** 3.1-3.8x less CPU, 4.7-7.0x lower memory, but **1.7-1.8x SLOWER wall time**. It is a resource lever, not a speed lever.

**Hard limits — do not design around capabilities that do not exist:**
- No video or WebGL rendering.
- No bot-challenge TLS fingerprinting.
- **No persistent session state (stateless by design)** — no long-lived logins.
- **Incomplete CDP coverage** — do not assume a CDP domain is implemented.
- Requires compatible websites.

```bash
node tools/cloudflare-kitesurf-browser.js --health --json
node tools/cloudflare-kitesurf-browser.js --url "https://example.com" --action html --json
node tests/test-cloudflare-kitesurf-browser.js
```

Needs `CLOUDFLARE_ACCOUNT_ID` + `CLOUDFLARE_API_TOKEN` (Browser Rendering - Edit) for screenshot/PDF. Without them, screenshot returns `UNAVAILABLE` — never a fake file.

| NEVER | ALWAYS |
|-------|--------|
| Claim READY / SUCCESS screenshot with no creds | Probe health; `liveClaim` only after the payload VALIDATES (magic bytes + content-type), never on HTTP 200 alone |
| Use Kitesurf for video, WebGL, TLS bot challenges, long auth | Route those to Browser Run Chromium |
| Regex-strip tags out of fetched HTML | `tools/lib/html-to-markdown.js` (tokenizer) — AGENTS.md bans naive script strip |
| Skip the fetch fallback on a transient 429/503 | Fall back for text actions; fail fast only on binary or 401/403 |
| Hero Continuity / Mac-pair | Hosted VPS remains the product lock |

Playground: https://kitesurf.cloudflare.app/  
Quick Actions: https://developers.cloudflare.com/browser-run/quick-actions/
