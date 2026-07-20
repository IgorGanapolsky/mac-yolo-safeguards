# Hermes browser control (agent automation)

North star: a real user pairs Hermes Mobile to **their Mac** and asks Chat to
browse/click/fill forms. Browser automation runs on the Mac via Chrome DevTools
Protocol (CDP) — not via `adb`, not via a phone extension.

**Compete verdict vs [Kimi WebBridge](https://www.kimi.com/features/webbridge):**
we compete on local-agent ↔ browser control (same CDP wedge). Full teardown:
[KIMI-WEBBRIDGE-TEARDOWN.md](./KIMI-WEBBRIDGE-TEARDOWN.md).

## One-command connect (WebBridge Local Agent steal)

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
| One-command installer | `scripts/install-browser-bridge.sh` | WebBridge-style Local Agent connect |
| CDP LaunchAgent | `com.hermes.chrome-cdp` | Heals Chrome remote debugging every 120s |
| Heal script | `scripts/hermes-chrome-cdp.sh` | Profile + port **9222** + IPv4 squat reclaim |
| Wire agent config | `scripts/wire-hermes-browser-cdp.sh` | Persist `browser.cdp_url` |
| Configure / status | `scripts/configure-browser-control.sh` | Apply + JSON status |
| Agent tools | `~/.hermes/hermes-agent/tools/browser_*.py` | navigate / click / cdp / … |
| Mobile UI | Chat → **Tools** | Toggle Browser Automation |
| SaaS connector | `tools/hermes-cloud-connector.js`, `saas/*` | Cloud **sessions** (adjacent, not DOM) |

## How the agent connects

1. `install-browser-bridge.sh` / LaunchAgent runs `hermes-chrome-cdp.sh`.
2. Chrome listens on `127.0.0.1:9222`.
3. `browser.cdp_url` points hermes-agent at that endpoint.
4. Hermes Mobile Chat → gateway → browser tools on the Mac.

## Real-user enable path (no adb)

1. On the Mac: `bash scripts/install-browser-bridge.sh`
2. Phone: install Hermes Mobile → Find computers / QR / Tailscale pair
3. Chat → Tools → **Browser Automation** on
4. Ask Hermes to open a site and act

## Gaps vs Kimi WebBridge

| Kimi WebBridge | Hermes today |
|---|---|
| Chrome/Edge **extension** (no restart) | CDP LaunchAgent; `--profile=daily` still restarts Chrome |
| In-tab “bridge connected” badge | CLI/JSON “Bridge connected” + Tools toggle |
| With Kimi Desktop mode | Hermes Mobile + Mac gateway |
| Convert workflow → Skill UI | Hermes skills exist; no WebBridge packaging UI yet |
