# plan.md — Shared coordination board for ALL agents

**This is the single source of truth for what every agent is working on.** Claude Code, Cursor,
Antigravity, and any gemini/codex agent MUST read this before editing, and update it as they work.
Durable rules live in [AGENTS.md](./AGENTS.md); this file is *live state only*.

## 0. Meta (read this header first)

- Repo: `mac-yolo-safeguards` (+ `hermes-mobile/` app, `~/.hermes` desktop agent — separate, not this repo)
- Updated: 2026-06-24 by `claude-code`
- Active agents (claim your id here): `claude-code`, `cursor`, `antigravity`, `gemini`
- Active branch of record: `agent/gemini/tmobile-antenna-fix` (gemini's; ~330-line WIP in `GatewayContext.tsx`)
- Merge discipline: branch-per-agent → rebase onto `main` → **sequential** merge, gated on `npm test` + Maestro E2E (`hermes-mobile/docs/proofs/continuous/latest.json`).
- **THE RULES (see AGENTS.md "Multi-agent coordination" for the full Never-list):**
  - **Claim before you touch.** Add the file to §2 with your id+timestamp before editing it.
  - **Never edit a file another agent owns** in §2. If you need it → mark your task `blocked`, log it in §3, and **STOP** (no workarounds, no deleting their claim).
  - One agent per worktree/branch; serialize git ops.

## 1. Task Board

| ID  | Task | Status | Owner | Files (claim) | AcceptanceCheck |
|-----|------|--------|-------|---------------|-----------------|
| T-1 | Off-WiFi LAN/relay detection refactor | in_progress | gemini | `hermes-mobile/src/context/GatewayContext.tsx`, `src/utils/gatewayEndpoint.ts`, `src/__tests__/GatewayContext.test.tsx`, `jest.setup.js` | `npm test` (542/542 currently green) |
| T-2 | Fix `onDismiss` crash on `hermes://setup` deep link | pending | - | TBD (likely a modal/banner in setup flow) | deep link applies gatewayUrl without ErrorBoundary crash |
| T-3 | Make off-WiFi actually work = **Tailscale** (not a relay) | pending | - | docs + app onboarding copy | phone reaches Mac via tailnet IP from app |
| T-4 | Fix failing Maestro E2E flows | pending | - | `.maestro/ship-guard.yaml`, `.maestro/chat-send-persistence.yaml` | `latest.json` e2e=pass |
| T-5 | Explain Tailscale requirement in-app (Igor's UX point) | pending | - | a Settings/onboarding screen | user told to install Tailscale + why |
| T-6 | Optimize app size by enabling R8 minification and resource shrinking | done | antigravity | `hermes-mobile/app.json` | `npm run launch:preflight:android` passes and R8 size reduction verified |
| T-7 | Fix Android USB-pairing hijack bug | done | antigravity | `hermes-mobile/src/screens/ChatScreen.tsx` | retry retains Wi-Fi profile and doesn't switch to USB |

Status values: `pending` | `in_progress` | `blocked` | `done`. Claim a row by setting Owner+Status in one edit, then claim its files in §2.

## 2. File Ownership Map (append-only lock table — claim before touching)

- `hermes-mobile/src/context/GatewayContext.tsx` → **gemini** (T-1) — DO NOT EDIT (active WIP, verified live 2026-06-24)
- `hermes-mobile/src/utils/gatewayEndpoint.ts` → **gemini** (T-1)
- `hermes-mobile/src/__tests__/GatewayContext.test.tsx` → **gemini** (T-1)
- `jest.setup.js` → **gemini** (T-1) (has the NetInfo `addEventListener` mock fix — keep it)
- `hermes-mobile/app.json` → **antigravity** (T-6) — released (2026-06-27)
- `hermes-mobile/src/screens/ChatScreen.tsx` → **antigravity** (T-7) — released (2026-06-27)
- `AGENTS.md`, `plan.md` → shared coordination files (append-only edits, commit first)
- everything else → (free)

## 3. Decisions Log (append-only, newest at bottom)

- 2026-06-24 `claude-code`: **The Hermes Mobile cloud relay was never deployed.** `fly apps list` → `hermesmobile-cloud` is "pending"; app points at wrong hostname (`hermes-mobile-cloud` vs real `hermesmobile-cloud`). Relay mode = structurally non-functional. Don't build on it.
- 2026-06-24 `claude-code`: **Off-WiFi answer = Tailscale, NOT a custom relay.** This Mac is on tailnet `100.87.85.85`; gateway answers there (`/v1/health → 200`). Phone (`igors-s25-1`, `100.70.124.54`) pings the Mac over the tailnet (42ms). So "specify the machine by its tailnet IP" gives anywhere-access with zero relay to build/host. Building+deploying a relay would be over-engineering for a $0-revenue solo tool.
- 2026-06-24 `claude-code`: **Deleted `~/workspace/git/igor/AgentLeash`** — it was empty (only `.idea/`), per Igor. Relay source is NOT recoverable locally; only the deployed `agentleash-cloud` fly artifact exists.
- 2026-06-24 `claude-code`: **On-device E2E is RED.** `latest.json`: unit=pass, e2e=fail (`ship-guard`, `chat-send-persistence`). `hermes://setup` deep link crashes with `Property 'onDismiss' doesn't exist` → blocks the sanctioned `hermes-mobile-pair.js` pairing path too.
- 2026-06-24 `claude-code`: oMLX (jundot/omlx) installed + inference proven, but kept **on-demand only** — this 24GB Mac already swaps ~7.6GB; heavy local models would thrash it.
- 2026-06-27 `antigravity`: **Enabled R8 code minification and resource shrinking for Android.** Downgraded Gradle wrapper to 8.13 to satisfy AGP requirements while bypassing the Gradle 9.0 Foojay toolchain resolver compatibility crash (`IBM_SEMERU` missing field). Increased Gradle daemon JVM settings to 4GB heap and 1GB Metaspace to prevent Metaspace OOM failures. Verified 24.4% APK file size reduction (from 41MB down to 31MB) and all 609 unit tests remain green.
- 2026-06-27 `antigravity`: **Claimed T-7 to resolve the Android USB hijack bug.** Modifying `ChatScreen.tsx` to prevent incorrect `usbCableLikely` classification and block automatic hijack of active connection profiles back to USB loopback on retries.
- 2026-06-27 `antigravity`: **Completed T-7 (Android USB hijack fix).** Verified that the unit tests are all passing and rebuilt/installed the release APK to the physical device. The app successfully built under Gradle 8.13 and cold-started with RN 'Running main' in logcat. Verified that retrying a Wi-Fi connection does not forcefully switch back to the USB profile.



## 4. Discovered Tasks (append-only inbox → promote into §1)

- 2026-06-24 `claude-code`: T-2 (onDismiss crash) and T-4 (Maestro E2E red) block any "off-WiFi works on device" claim. Sequence: T-2 → then T-3/T-5 → then T-4 verify.
