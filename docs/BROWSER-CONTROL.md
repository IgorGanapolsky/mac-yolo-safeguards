# Hermes browser control (agent automation)

North star: a real user pairs Hermes Mobile to **their Mac** and asks Chat to
browse/click/fill forms. Browser automation runs on the Mac via Chrome DevTools
Protocol (CDP) — not via `adb`, not via a phone extension.

## What we already host

| Piece | Path / identity | Role |
|---|---|---|
| CDP LaunchAgent | `com.hermes.chrome-cdp` | Every 120s heals Chrome with remote debugging |
| Heal script | `scripts/hermes-chrome-cdp.sh` | Starts `~/.hermes/chrome-cdp-profile` on port **9222** |
| Installer | `scripts/install-hermes-chrome-cdp.sh` | Bootstraps the LaunchAgent from `com.hermes.chrome-cdp.plist` |
| Prevention watchdog | `scripts/hermes-prevention-watchdog.sh` + `com.igor.hermes-prevention-watchdog` | Ensures CDP up, SOUL no-constraints, never `disabled_toolsets: [browser]` |
| One-shot configure | `scripts/configure-browser-control.sh` | Real-user/fleet apply + JSON status |
| Agent tools | `~/.hermes/hermes-agent/tools/browser_*.py` | `browser_navigate`, `browser_click`, `browser_cdp`, … |
| Mobile UI | Hermes Mobile → Chat → **Tools** (`GatewayOpsSection`) | Lists/toggles toolsets including Browser Automation |
| SaaS / WebBridge-style connector | `tools/hermes-cloud-connector.js`, `saas/*`, `apps/hermes-control-plane` | Cloud **session** access from a website (different product surface) |

Evidence (this Mac, 2026-07-20): LaunchAgent `com.hermes.chrome-cdp` loaded;
Chrome DevTools answered on `[::1]:9222` while a non-CDP Python squat held
`127.0.0.1:9222` — heal script now reclaims non-CDP squatters and forces
`--remote-debugging-address=127.0.0.1`.

## How the agent connects

1. LaunchAgent runs `hermes-chrome-cdp.sh`.
2. Chrome listens on `127.0.0.1:9222` with `--remote-allow-origins=*`.
3. Hermes gateway (`api_server` platform toolsets) includes `browser` + `computer_use`.
4. Tools resolve CDP via `BROWSER_CDP_URL` / `browser.cdp_url` / engine auto.
5. Hermes Mobile Chat messages hit the gateway; the Mac executes browser tools.

Ports: **9222** (primary Hermes CDP). Some fleet hosts also use **9223** for a
secondary profile — see `docs/BROWSER-EFFICIENCY.md`.

## Real-user enable path (no adb)

On the Mac that Hermes Mobile pairs to:

```bash
bash scripts/configure-browser-control.sh --apply --json
```

Then on the phone (brand-new user):

1. Install Hermes Mobile (Play / release APK).
2. Connect to the Mac (Find computers / QR / Tailscale) — ordinary pairing.
3. Open Chat → Tools → confirm **Browser Automation** is on (ready tools auto-enable).
4. Ask Hermes to open a site and act (e.g. navigate + summarize).

There is no phone Chrome extension and no USB requirement for browser control.

## Gaps vs Kimi WebBridge

| Kimi WebBridge | Hermes today |
|---|---|
| Browser extension / bridge UI in the user's daily Chrome | Dedicated Hermes CDP Chrome profile (isolated from daily browsing) |
| One-command cloud connector for web dashboard | Shipped separately: `tools/hermes-cloud-connector.js` + control plane (session relay, not DOM control) |
| Visible “bridge connected” chrome in consumer browser | Status via `configure-browser-control.sh --json` + Tools toolset toggle |
| Works without a local agent install | Requires Hermes gateway on the user's Mac (product model) |

Honest remainder: we do **not** inject a WebBridge-style extension into the
user's everyday Chrome tabs. Agent control uses the Hermes CDP profile (safer
isolation). Cloud “open Hermes in a browser” is the connector/control-plane path,
not this CDP stack.
