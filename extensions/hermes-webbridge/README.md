# Hermes Browser Bridge (Chrome extension scaffold)

WebBridge-style **install path** for Local Agent mode. This MV3 extension does
**not** replace Mac CDP hosting — it shows bridge health and copies the connect
prompt. DOM automation still runs via `com.hermes.chrome-cdp` + hermes-agent.

## Real-user install (no Chrome Web Store yet)

1. On the Mac: `bash scripts/install-browser-bridge.sh`
2. Chrome → `chrome://extensions` → Developer mode → **Load unpacked**
3. Select this folder: `extensions/hermes-webbridge`
4. Open the extension popup — should show **Bridge connected** when `:9222` is healthy
5. Hermes Mobile: Pair Mac → Tools → Browser Automation on → ask Hermes to browse

## Honest gap vs Kimi WebBridge

Kimi’s extension drives the user’s everyday tabs without restarting Chrome.
This scaffold is status + connect UX only; full `chrome.debugger` attach is the
next queued steal once CDP daily-profile mode proves insufficient.
