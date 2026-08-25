---
name: kitesurf-account-rail
description: >
  Use Cloudflare Kitesurf via Browser Run for public one-shot screenshots/HTML
  by filling CLOUDFLARE_ACCOUNT_ID from wrangler whoami. Fail-closed PNG magic.
  Not a Kitesurf clone. Do not dual-edit PR #2010/#2079 adapters. Slash:
  /kitesurf-account-rail.
---

# Kitesurf account-id rail

Source: https://blog.cloudflare.com/kitesurf/

ThumbGate.app's hosted Worker does **not** call Kitesurf. The advantage is
**agent ops**: public landing/funnel captures without spawning Chromium on
Igor's Mac. Sibling adapters (#2010/#2079) stay the Browser Run client;
this rail fills the account-id gap that made `--health` report UNAVAILABLE
while wrangler OAuth was already logged in.

```bash
node tools/kitesurf-account-rail.js --doctor --json
node tools/kitesurf-account-rail.js --url "https://thumbgate.app" --action screenshot --output /tmp/ks.png --json
node tests/test-kitesurf-account-rail.js
```

Verified 2026-08-25: with account `0cae7e525b9750f258704159b9bba785` + wrangler
OAuth, Browser Run `?browser=kitesurf` returned a PNG of thumbgate.app
(1920×1080, `\x89PNG` magic, ~203 KiB) and HTML extract `liveClaim=true`.

## Steal

1. One-shot public screenshot/HTML on Workers, not local Chromium.
2. Fail-closed: HTTP 200 is not a screenshot — require PNG magic.
3. Auto-fill account id from `wrangler whoami --json` when env is empty.

## Skip

| Skip | Why |
|------|-----|
| Hosted Worker Browser Run binding | No Worker secret this change |
| video / WebGL / long auth | Cloudflare: use Chromium / BrowserOS |
| `tools/cloudflare-kitesurf-browser.js` | OPEN #2010 / #2079 |
| Untracked shared-tree adapter | Fake READY / fake files — do not use |
