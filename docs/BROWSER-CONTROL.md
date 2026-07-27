# Hermes browser control (agent automation)

North star: a real user pairs Hermes Mobile to **their Mac** and asks Chat to
browse/click/fill forms. Browser automation runs on the Mac via Chrome DevTools
Protocol (CDP) — not via `adb`, not via a phone extension.

**Compete verdict vs [Kimi WebBridge](https://www.kimi.com/features/webbridge):**
we compete on local-agent ↔ browser control (same CDP wedge). Full teardown:
[KIMI-WEBBRIDGE-TEARDOWN.md](./KIMI-WEBBRIDGE-TEARDOWN.md).

## One-command connect (preferred: no Chrome restart)

```bash
# chrome.debugger path — everyday tabs, no quit/restart
bash scripts/install-browser-bridge.sh --mode=debugger
```

Then load unpacked `extensions/hermes-webbridge` once. The local bridge serves
`:9222` for hermes-agent; the extension attaches with `chrome.debugger`.

### Fallback (remote-debugging-port)

```bash
bash scripts/install-browser-bridge.sh
# keep everyday Chrome logins (quits Chrome once):
bash scripts/install-browser-bridge.sh --profile=daily
```

This heals `com.hermes.chrome-cdp`, wires `browser.cdp_url: ws://127.0.0.1:9222`,
kickstarts the gateway, and prints a paste-to-agent line.

## What we already host

| Piece | Path / identity | Role |
|---|---|---|
| One-command installer | `scripts/install-browser-bridge.sh` | WebBridge-style Local Agent connect (`--mode=debugger\|cdp`) |
| Debugger bridge | `scripts/hermes-chrome-debugger-bridge.js` + `com.hermes.chrome-debugger` | CDP on `:9222` via extension relay `:9223` |
| Debugger installer | `scripts/install-hermes-chrome-debugger.sh` | LaunchAgent; bootouts chrome-cdp while active |
| MV3 extension | `extensions/hermes-webbridge/` | `chrome.debugger.attach` + popup status |
| CDP LaunchAgent | `com.hermes.chrome-cdp` | Heals Chrome remote debugging every 120s (cdp mode) |
| Heal script | `scripts/hermes-chrome-cdp.sh` | Profile + port **9222** + IPv4 squat reclaim |
| Wire agent config | `scripts/wire-hermes-browser-cdp.sh` | Persist `browser.cdp_url` |
| Configure / status | `scripts/configure-browser-control.sh` | Apply + JSON status (cdp mode) |
| Agent tools | `~/.hermes/hermes-agent/tools/browser_*.py` | navigate / click / cdp / … |
| Mobile UI | Chat → **Tools** | Toggle Browser Automation |
| SaaS connector | `tools/hermes-cloud-connector.js`, `saas/*` | Cloud **sessions** (adjacent, not DOM) |

## How the agent connects (debugger mode)

1. `install-browser-bridge.sh --mode=debugger` starts `com.hermes.chrome-debugger`.
2. Bridge listens on `127.0.0.1:9222` (agent) + `127.0.0.1:9223/hermes-ext` (extension).
3. Unpacked extension service worker connects outbound and uses `chrome.debugger`.
4. `browser.cdp_url` still points hermes-agent at `ws://127.0.0.1:9222`.
5. Hermes Mobile Chat → gateway → browser tools on the Mac.

## Real-user enable path (no adb)

1. On the Mac: `bash scripts/install-browser-bridge.sh --mode=debugger`
2. Chrome → `chrome://extensions` → Load unpacked → `extensions/hermes-webbridge`
3. Phone: install Hermes Mobile → Find computers / QR / Tailscale pair
4. Chat → Tools → **Browser Automation** on
5. Ask Hermes to open a site and act

## Gaps vs Kimi WebBridge

| Kimi WebBridge | Hermes today |
|---|---|
| Chrome/Edge **extension** (no restart) | **Shipped** — `chrome.debugger` + local bridge (`--mode=debugger`) |
| Chrome Web Store one-click | Load unpacked (store publish still open) |
| In-tab “bridge connected” badge | Extension popup + action badge **ON** |
| With Kimi Desktop mode | Hermes Mobile + Mac gateway |
| Convert workflow → Skill UI | Hermes skills exist; no WebBridge packaging UI yet |

## Chrome extension install path (WebBridge steal)

Load unpacked (no store publish yet):

1. `bash scripts/install-browser-bridge.sh --mode=debugger`
2. Chrome → `chrome://extensions` → Developer mode → Load unpacked
3. Select `extensions/hermes-webbridge`
4. Popup / badge shows debugger bridge linked when `:9223` health is up

Leash: browser tool approvals show a **BROWSER CONTROL** badge on the phone
(`browserControlTools.ts` + `HermesApprovalCard`).
