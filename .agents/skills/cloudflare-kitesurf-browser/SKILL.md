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

Steal the **mechanic** (ephemeral WASM browser for agents, CDP-compatible, `browser=kitesurf`). Do **not** vendor Chromium. Kitesurf is beta; not open source yet.

```bash
node tools/cloudflare-kitesurf-browser.js --health --json
node tools/cloudflare-kitesurf-browser.js --url "https://example.com" --action html --json
node tests/test-cloudflare-kitesurf-browser.js
```

Needs `CLOUDFLARE_ACCOUNT_ID` + `CLOUDFLARE_API_TOKEN` (Browser Rendering - Edit) for screenshot/PDF. Without them, screenshot returns `UNAVAILABLE` — never a fake file.

| NEVER | ALWAYS |
|-------|--------|
| Claim READY / SUCCESS screenshot with no creds | Probe health; `liveClaim` only after Browser Run 200 |
| Use Kitesurf for video, WebGL, TLS bot challenges, long auth | Route those to Browser Run Chromium |
| Hero Continuity / Mac-pair | Hosted VPS remains the product lock |

Playground: https://kitesurf.cloudflare.app/  
Quick Actions: https://developers.cloudflare.com/browser-run/quick-actions/
