# Deep Research — July 2026 Hermes Mobile Remote Operator UX

**Date:** 2026-06-26 (July 2026 standards applied)  
**Scope:** Remote Mac operator mobile apps, multi-Mac discovery, RN operator UX, Hermes Mobile connectivity gaps  
**Repo:** `mac-yolo-safeguards` / `hermes-mobile`

---

## Executive summary — what to build

Hermes Mobile must match **July 2026 operator-app parity** (Codex mobile, Tailscale SSH, meshTerm/Termius patterns):

1. **Three connection tiers, honest UI** — USB (adb reverse `:8642`), LAN Wi‑Fi (`10.x/192.168.x:8642`), relay/tunnel (cellular + away). Never label relay-only as “connected” for Chat.
2. **Multi-Mac profile switching** — saved computers list with live reachability, USB host identity from `/health` hostname, **wrong-Mac-on-USB detection** when cable points at MacBook Pro but profile says Mac mini.
3. **Cellular truth** — off Wi‑Fi, private LAN URLs cannot work; surface “Pair relay (approvals) + tunnel URL `:8642` (Chat)” instead of generic unreachable copy.
4. **Codex-class remote operator** — QR pair per host, multi-host switcher, persistent sessions, approval push when host needs input; relay layer for NAT (OpenAI docs, May–June 2026).
5. **RN keyboard July 2026** — `react-native-keyboard-controller` + `KeyboardChatScrollView` for chat composer; NetInfo-driven connection banner, pull-to-refresh on connection panel (not chat transcript).

**Shipped this session (minimal fix):** `detectUsbHostMismatch` + cellular tunnel copy in `ChatConnectionPanel` — see Part C below.

---

## Ranked recommendations (with sources)

### P0 — Connection honesty & multi-Mac (ship first)

| # | Recommendation | Why (July 2026) | Source |
|---|----------------|-----------------|--------|
| 1 | **Wrong-Mac-on-USB banner** — compare `/health.hostname` vs active saved profile when on `127.0.0.1:8642`; offer one-tap switch to matching saved profile | USB adb reverse always routes to the **plugged-in** Mac, not the selected profile. Codex pairs QR **per host**; SSH clients bind hosts to profiles (meshTerm). | [OpenAI Codex remote connections](https://developers.openai.com/codex/remote-connections), [meshTerm App Store](https://apps.apple.com/ie/app/meshterm-ssh-ftp-via-tailscale/id6761196011), repo RAG Tailscale P2P lesson 2026-06-22 |
| 2 | **Cellular blocks LAN** — when `NetInfo` off Wi‑Fi + gateway is private LAN, title “Cellular — need tunnel” and Settings → Advanced `:8642` tunnel steps | Tailscale/SSH pattern: stable `100.x` or tunnel required off-LAN; no port-forward theater. | [Tailscale SSH](https://tailscale.com/kb/1193/tailscale-ssh/), [samwize Tailscale+SSH+tmux Feb 2026](https://samwize.com/2026/02/08/control-your-mac-from-your-iphone-safely-tailscale-ssh-tmux/) |
| 3 | **Chat vs relay split** — relay paired ≠ Chat live; banner: “Chat needs direct link (Wi‑Fi, USB, or tunnel `:8642`); relay = approvals only” | Matches Codex: phone is control surface; compute stays on host. Hermes gap user reported. | [OpenAI remote connections](https://developers.openai.com/codex/remote-connections), `hermes-mobile/src/utils/chatErrors.ts` |
| 4 | **Multi-host picker like Codex** — Settings + Chat connection panel: saved computers, relay workers not in saved list, status chips (USB tunnel / Mac HTTP / Relay / Wi‑Fi) | Codex May 2026: switch between connected hosts; meshTerm profile-bound hosts. | [Codex mobile May 2026](https://knightli.com/en/2026/05/17/codex-mobile-remote-access-enterprise-access-tokens/), `ChatConnectionPanel.tsx` |

### P1 — Tunnel & relay setup UX

| # | Recommendation | Repo action | Source |
|---|----------------|-------------|--------|
| 5 | **Settings tunnel wizard** — Tailscale MagicDNS `http://mac-mini.tailnet:8642` or ngrok one-liner copy | `SettingsScreen.tsx` Advanced section + link to `install.sh` Tailscale keepalive | RAG: Tailscale P2P over T-Mobile 5G 2026-06-22 |
| 6 | **Auto relay pair from pair-server** — when LAN probe finds `:8765/pair`, push relay code (already partial in `GatewayContext`) | Harden `resolvePairServerRelayCode` + Settings CTA | `gatewayDiscovery.ts`, `tools/hermes-mobile-pair.js` |
| 7 | **Pull-to-refresh connection panel** — refresh health + scan, not full chat reload | Offline-first 2026: separate network vs sync state | [RN offline-first 2026](https://reactnative.live/react-native-offline-first-guide-storage-sync-conflict-handling-and-ux-patterns) |

### P2 — Codex parity & keyboard

| # | Recommendation | Repo action | Source |
|---|----------------|-------------|--------|
| 8 | **QR pair per Mac** (already have) — align copy with Codex: “Pair every phone with every host” | `macPairingUx.ts`, `PairQrScannerModal.tsx` | [OpenAI Codex setup flow](https://developers.openai.com/codex/remote-connections) |
| 9 | **`react-native-keyboard-controller`** — migrate chat composer from manual inset math to `KeyboardChatScrollView` + `KeyboardStickyView` | `ChatInputBar.tsx`, `composerKeyboard.ts`, `App.tsx` KeyboardProvider | [RN Relay keyboard guide Jun 2026](https://reactnativerelay.com/article/react-native-keyboard-handling-controller-2026), [Expo keyboard-controller](https://docs.expo.dev/versions/latest/sdk/keyboard-controller/) |
| 10 | **agent-device + Maestro in preflight** — newsletter #1 ROI | `scripts/release-preflight.sh` | [Callstack newsletter May 2026](https://www.callstack.com/newsletters/apex-agent-device-expo-sdk-56-inspector-and-react-native-evals) |

### P3 — Infrastructure (Mac mini on cellular)

| # | Recommendation | Evidence |
|---|----------------|----------|
| 11 | Tailscale keepalive loops MacBook ↔ Mac mini for direct P2P (not Miami DERP) | RAG SUCCESS 2026-06-22 |
| 12 | Mac mini always-on host for Codex-class remote (lid open, gateway LaunchAgent) | [OpenAI dedicated always-on computer](https://developers.openai.com/codex/remote-connections) |
| 13 | Expo SDK 56 track when bounded upgrade PR ready | Newsletter ingest score 238 |

---

## Hermes Mobile gap analysis (user-reported)

| Symptom | Root cause | July 2026 fix |
|---------|------------|---------------|
| Can't reach Mac mini on cellular | Private LAN URL (`10.x`) unreachable off home Wi‑Fi | Cellular banner + tunnel URL in Settings; relay for approvals |
| USB shows MacBook Pro | adb reverse terminates on **connected** Mac, not selected profile | `detectUsbHostMismatch` (shipped) |
| Relay not paired | User never completed Settings pair code | Auto pair-server code + RelayPairStrip copy |
| Chat needs direct `:8642` | Relay queue ≠ chat HTTP/WebSocket | `chatSendBlockedMessage` + connection panel honesty (existing + enhanced) |

---

## Concrete repo actions → files

| Action | Files |
|--------|-------|
| USB wrong-Mac detection | `hermes-mobile/src/utils/gatewayProfilePicker.ts` (`detectUsbHostMismatch`) |
| Connection panel UX | `hermes-mobile/src/components/ChatConnectionPanel.tsx` |
| Wire from Chat | `hermes-mobile/src/screens/ChatScreen.tsx` |
| LAN/cellular copy | `hermes-mobile/src/utils/chatErrors.ts`, `gatewayEndpoint.ts` |
| Multi-Mac profiles | `hermes-mobile/src/services/gatewayProfiles.ts`, `GatewayProfilePicker.tsx` |
| Pair / discovery | `hermes-mobile/src/services/gatewayDiscovery.ts`, `tools/hermes-mobile-pair.js` |
| Relay | `hermes-mobile/src/components/RelayPairStrip.tsx`, `mobileRelayClient.ts` |
| Tunnel settings | `hermes-mobile/src/screens/SettingsScreen.tsx` (Advanced) |
| Keyboard upgrade | `hermes-mobile/src/components/ChatInputBar.tsx`, `package.json` |
| E2E proof | `hermes-mobile/.maestro/`, LaunchAgent `com.igor.hermes-mobile-continuous-e2e` |
| Research pipeline | `tools/react-native-newsletter-ingest.js`, `com.igor.react-native-newsletter-ingest` |
| Agent automation | `.cursor/automations/weekly-newsletter-roi.yaml` |

---

## Research pipeline status (Part B)

- **Ingest run:** `node tools/react-native-newsletter-ingest.js --limit 12 --top 8 --min-score 45 --decision-stack` → 0 new items; top ROI **238** (Callstack Agent Device + Maestro preflight).
- **LaunchAgent:** `com.igor.react-native-newsletter-ingest` **loaded**, interval 604800s (7 days).
- **CEO brief:** includes `newsletterTop` — Apex / Agent Device / SDK 56.
- **Automation YAML:** `.cursor/automations/weekly-newsletter-roi.yaml` — valid (cron Mon 09:00, ingest + decision-stack prompt).

---

## Part C — Implemented this session

**Fix:** USB host mismatch detection + cellular tunnel guidance in connection panel.

- When USB loopback is up but `/health.hostname` ≠ active saved profile → title **“Wrong Mac on USB”** with tap-to-switch copy.
- When off Wi‑Fi and gateway is private LAN → title **“Cellular — need tunnel”** with `:8642` + Settings pointer.

**Tests:** `gatewayProfilePicker.test.ts`, `ChatConnectionPanel.test.tsx` (new cases).

---

## References

- OpenAI Codex remote connections: https://developers.openai.com/codex/remote-connections  
- Codex mobile May 2026: https://knightli.com/en/2026/05/17/codex-mobile-remote-access-enterprise-access-tokens/  
- Tailscale SSH: https://tailscale.com/learn/remote-collaboration-with-ssh-securely-working-together-across-networks  
- Tailscale SSH iPhone 2026: https://www.vybecoding.sh/blog/tailscale-ssh-setup-iphone  
- samwize Tailscale + SSH + tmux: https://samwize.com/2026/02/08/control-your-mac-from-your-iphone-safely-tailscale-ssh-tmux/  
- meshTerm (multi-profile Tailscale SSH): https://apps.apple.com/ie/app/meshterm-ssh-ftp-via-tailscale/id6761196011  
- Mobile SSH Android (profiles + ET): https://mobile-ssh.github.io/  
- RN keyboard controller 2026: https://reactnativerelay.com/article/react-native-keyboard-handling-controller-2026  
- react-native-keyboard-controller: https://github.com/kirillzyusko/react-native-keyboard-controller  
- Expo keyboard handling: https://docs.expo.dev/guides/keyboard-handling  
- Callstack newsletter (Agent Device): https://www.callstack.com/newsletters/apex-agent-device-expo-sdk-56-inspector-and-react-native-evals  
- Repo skill: `.cursor/skills/troubleshoot-hermes-mobile-connectivity/SKILL.md`
