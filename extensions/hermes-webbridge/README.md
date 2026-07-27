# Hermes Browser Bridge (Chrome extension)

WebBridge-style install path for Local Agent mode. Two hosting modes share the
same agent contract (`browser.cdp_url: ws://127.0.0.1:9222`):

| Mode | How tabs are driven | Chrome restart? |
|---|---|---|
| **debugger** (preferred) | MV3 `chrome.debugger` + local bridge | **No** |
| **cdp** (fallback) | `com.hermes.chrome-cdp` `--remote-debugging-port` | Yes for `--profile=daily` |

## Real-user install (debugger — no restart)

1. On the Mac: `bash scripts/install-browser-bridge.sh --mode=debugger`
2. Chrome → `chrome://extensions` → Developer mode → **Load unpacked**
3. Select this folder: `extensions/hermes-webbridge`
4. Accept the debugger permission prompt when Hermes attaches to a tab
5. Popup badge **ON** = extension linked to the local bridge
6. Hermes Mobile: Pair Mac → Tools → Browser Automation on → ask Hermes to browse

## Fallback (dedicated / daily CDP profile)

```bash
bash scripts/install-browser-bridge.sh
# or keep everyday logins (quits Chrome once):
bash scripts/install-browser-bridge.sh --profile=daily
```

## Architecture

```
hermes-agent  --CDP-->  :9222 bridge  <--WS :9223--  extension (chrome.debugger)
```

The bridge (`scripts/hermes-chrome-debugger-bridge.js`) speaks Chrome's
`/json/version` + `/json/list` + DevTools WebSockets. The service worker attaches
to tabs with `chrome.debugger.attach` and relays CDP methods/events — no
`--remote-debugging-port`, so everyday Chrome keeps running.
