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

Sources: https://blog.cloudflare.com/kitesurf/ · https://developers.cloudflare.com/browser-run/

Steal the **mechanic** (ephemeral WASM browser for agents, CDP-compatible, `browser=kitesurf`). Do **not** vendor Chromium. Kitesurf is beta; not open source yet.

```bash
cd ~/workspace/git/igor/mac-yolo-safeguards
node tools/cloudflare-kitesurf-browser.js --health --json
node tools/cloudflare-kitesurf-browser.js --url "https://example.com" --action html --json
node tools/cloudflare-kitesurf-browser.js --url "https://example.com" --action screenshot --output /tmp/ks.png
node tests/test-cloudflare-kitesurf-browser.js
```

Needs `CLOUDFLARE_ACCOUNT_ID` + `CLOUDFLARE_API_TOKEN` (**Browser Rendering - Edit**) for screenshot/PDF. Wrangler OAuth alone is not enough (no Browser Run scope). Without them, screenshot returns `UNAVAILABLE` — never a fake file. HTML may still succeed via `fetch` with `liveClaim=false`.

| NEVER | ALWAYS |
|-------|--------|
| Claim READY / SUCCESS screenshot with no creds | Probe health; `liveClaim` only with Browser Run creds |
| Use Kitesurf for video, WebGL, TLS bot challenges, long auth | Route those to Browser Run Chromium or BrowserOS |
| Hero Continuity / Mac-pair | Hosted VPS remains the product lock |

Account (Igor): wrangler whoami → `0cae7e525b9750f258704159b9bba785`. Mint API token in Cloudflare dashboard with Browser Rendering edit, store via `/credentials-secure-store-and-skill`.

Playground: https://kitesurf.cloudflare.app/
