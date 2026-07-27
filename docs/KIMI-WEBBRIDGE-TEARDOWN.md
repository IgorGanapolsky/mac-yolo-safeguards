# Kimi WebBridge competitive teardown (2026-07-20)

Source: [kimi.com/features/webbridge](https://www.kimi.com/features/webbridge) (public page + FAQ).

## Compete / don't-compete verdict

**Competes** on the overlapping wedge: **local AI agent ↔ drive the user's browser**
(click / fill / navigate / extract on a real Chromium with local sessions).

**Adjacent (not the same product):** Kimi Desktop + cloud Work; Hermes Mobile
phone approvals + Mac gateway; Hermes cloud connector/control-plane (session
relay from a website — not DOM control).

We must win the overlapping wedge. Ranking / ASO is a sibling lane.

## WebBridge capabilities (evidence)

| Capability | WebBridge | Our stack map |
|---|---|---|
| Click / fill / navigate / extract | Extension + local service → **CDP** | `hermes-agent` `browser_*` / `browser_cdp` + debugger bridge **or** `com.hermes.chrome-cdp` |
| Modes | **With Kimi Desktop** / **With Local Agent** | Hermes gateway (`api_server`) + Mobile Chat; CLI `/browser connect` |
| Install UX | Extension store + ~1 min video; paste connect command | `scripts/install-browser-bridge.sh --mode=debugger` |
| Existing Chrome logins | Yes — extension in daily Chrome/Edge | **`chrome.debugger`** on everyday Chrome (no restart); CDP `--profile=daily` remains fallback |
| Local-only privacy FAQ | CDP locally; sessions never leave device | Same model: loopback `:9222`, no cloud browser required |
| Disconnect recovery | Resend connect command + restart Desktop | `configure-browser-control.sh --apply` / re-run debugger install + gateway kickstart |

FAQ quote (architecture): *“pairs a local service with a browser extension…
uses Chrome DevTools Protocol… in your existing Chrome or Edge.”*

## High-ROI steals (ranked)

| Rank | Steal | Impact × feasibility | Status |
|---|---|---|---|
| 1 | One-command Local Agent connect | High × High (mirror WebBridge paste flow) | **Shipped** — `install-browser-bridge.sh` |
| 2 | Persist `browser.cdp_url` after connect | High × High (agent was not wired) | **Shipped** — `wire-hermes-browser-cdp.sh` |
| 3 | Heal IPv4 CDP squats / bind 127.0.0.1 | High × High (bridge looked up, was dead) | **Shipped** — `hermes-chrome-cdp.sh` |
| 4 | Daily Chrome profile mode (keep logins) | High × Medium (needs Chrome quit) | **Shipped** — `--profile=daily` |
| 5 | Visible “Bridge connected” + paste line | Medium × High | **Shipped** — configure status copy / JSON |
| 6 | Chrome/Edge **extension** (no restart) | High × Medium | **Shipped** — `chrome.debugger` + `hermes-chrome-debugger-bridge.js` (`--mode=debugger`) |
| 7 | Cross-site workflow → Skill packaging UI | Medium × Low | Queued (Hermes skills already exist) |

## Honest gaps remaining vs WebBridge

1. No Chrome Web Store listing yet — load unpacked still required.
2. No in-page overlay badge inside arbitrary sites (popup/action badge only).
3. Cloud “With Kimi Desktop” analogue is Hermes control-plane/connector (sessions), not DOM.
