---
name: cdp-bridge-automation
description: >
  Drive Igor's dedicated CDP Chrome (localhost:9222) without hijacking his
  interactive session and without enumerating all tabs (which hangs
  connectOverCDP). Use for Stripe dashboard reads, isolated tab work,
  and as the lower runtime layer behind Browser-use.
safety: >
  NEVER touch interactive Chrome (Chrome Profile 1 on :9222 is the SAFETY
  boundary; Igor's foreground Chrome is forbidden). Never store secrets.
---

# cdp-bridge-automation

## What this is

A deterministic browser automation layer against a **dedicated** CDP Chrome
instance on `ws://127.0.0.1:9222`. Not a vision engine — use Playwright for
DOM actions, an external model (Claude/OpenAI) only for decisions.

## Local state (verified 2026-08-07, updated 2026-08-08)

- Chrome 151.0.7922.76 reachable on :9222 ✓
- 37 live tabs incl. authenticated `dashboard.stripe.com`, Reddit compose, live
  `buy.stripe.com/eVqcN53Ug1eS5pL0XN3sI2A` ✓
- Playwright v1.62.1 (Node) present ✓
- browser-use 0.13.7 installed+verified ✓ (see proof scripts below)

## browser-use CDP proof (verified 2026-08-08)

browser-use 0.13.7 exposes `BrowserSession` (NOT v1.0's `Browser`/`BrowserConfig`).
`cdp_url=` attaches to the existing dedicated Chrome without enumerating the 37 tabs.

Venv: `.venv-cdp` (Python 3.11.15 at `/opt/homebrew/bin/python3.11`).

Proof A — construction only:

```python
from browser_use.browser import BrowserSession
s = BrowserSession(cdp_url="http://127.0.0.1:9222")   # constructs OK, no hang
```

Proof B — isolated-tab drive (writes one data: URL into a NEW tab, never the 37):

```python
import asyncio
from browser_use.browser import BrowserSession

async def main():
    s = BrowserSession(cdp_url="http://127.0.0.1:9222")
    await s.start()
    try:
        page = await s.new_page("about:blank")
        print("title:", await page.evaluate("() => document.title"))
        await page.goto("data:text/html,<title>CDP-PROBE-OK</title>")
        print("navigated:", await page.evaluate("() => document.title"))
        # tab cleanup owned by CDP session; no Page.close needed
    finally:
        await s.stop()

asyncio.run(main())
```

Observed output:

```
title: ''
navigated: 'CDP-PROBE-OK'
```

## The hang + workaround

`chromium.connectOverCDP('http://127.0.0.1:9222')` **hangs** because Playwright
enumerates all 37 existing tabs.

Workaround — spawn an isolated blank tab, then attach to that tab only:

```bash
# 1) Create fresh tab (PUT, not GET)
curl -s --max-time 5 -X PUT \
  'http://127.0.0.1:9222/json/new?about:blank' \
  | python3 -c "import sys,json;d=json.load(sys.stdin);print(d['webSocketDebuggerUrl'])"
# -> ws://127.0.0.1:9222/devtools/page/<TABID>
```

Then in Playwright:

```js
const {chromium}=require('playwright');
const b=await chromium.connectOverCDP('http://127.0.0.1:9222',{timeout:0});
// new tab via CDP /json/new, grab its wsURL, or use b.contexts()[0].newPage()
```

## Decision tree

```
Need to drive browser?
├─ Need auth session (Stripe/Reddit/Skool) already in dedicated Chrome?
│   └─ YES → attach via CDP. Do NOT open a new browser that loses cookies.
├─ Need vision/model decisions?
│   └─ Must have browser-use OR anthropic SDK + key (see verify-computer-use-tooling).
│       Locally MISSING → gate. Do not claim automation is wired.
└─ Pure DOM (scrape/extract/click)?
    └─ Playwright CDP suffice. No vision key needed.
```

## Hard rules

- Never enumerate all 37 tabs — hang. Isolate a new tab via `PUT /json/new`.
- Never drive interactive Chrome — dedicated :9222 only.
- `PUT /json/new` is safe; `GET /json/new` returns an error (verb check).
