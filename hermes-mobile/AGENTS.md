# AGENTS.md — Hermes Mobile

Canonical repo rules: [../AGENTS.md](../AGENTS.md). This file adds **mobile-only** obligations so agents do not wait for the user to ask.

## Standing orders (no reminders)

1. **Session start** — parent repo runs `node tools/agent-session-start.js` (pairing, LaunchAgent health, continuous E2E status). Do not skip when touching this tree.
2. **After any edit** under `src/`, `app.json`, or `.maestro/` — in the **same turn** before claiming fixed/shipped:
   - `npm test -- --no-coverage --watchman=false`
   - Kick autonomous E2E: `launchctl kickstart -k "gui/$(id -u)/com.igor.hermes-mobile-continuous-e2e"` **or** `npm run e2e:continuous:once`
3. **Never ask the user** to run Maestro, reload Metro, plug in a phone, or tap Send — use `adb`, `hermes-mobile-pair.js`, and scripts.
4. **Read** `docs/proofs/continuous/latest.json` before saying chat/E2E is healthy. If `e2e` ≠ `pass`, say so with the JSON — do not claim device UX is verified.
5. **Phone connected** (`adb devices`) → E2E prefers Android automatically via `scripts/run-e2e.sh`.
6. **Phone install only via release path** — `npm run android:phone` or `scripts/install-phone-release.sh`; never `expo run:android` on device (`npm run android` blocks when adb sees a phone).
7. **RN performance work** — read `.cursor/skills/react-native-best-practices/SKILL.md` first (Callstack 2026 optimization guide skills). Install/refresh: `bash ../scripts/install-callstack-agent-skills.sh`. Measure before optimizing.
8. **Real users product** — Hermes Mobile ships to **real users**, not Igor-only dogfood. No feature is "done" if it requires `adb`, dev backdoor, or pre-paired Igor Mac.
9. **Brand-new user testing (permanent)** — **always treat every test as if it is a brand new user:** fresh install, no saved profiles, no `developerLeashUnlock`, cellular or Wi‑Fi only, release APK. Maestro and manual proofs must reflect that mindset.
10. **Multi-Mac API keys** — Mac mini and MacBook Pro can have different `API_SERVER_KEY` values. Pair mini via `node tools/hermes-mobile-pair.js --mini-tailscale` (SSH-fetches mini key); never paste the laptop `.env` key when targeting another machine.
11. **Device/Maestro chat input (permanent)** — When testing via Maestro, `adb input text`, or any device/E2E automation that types into the **chat composer**, use only **`make money today`**. Never type gibberish probe strings (`typeableProbeB`, `e2e-chat-send-persist`, `smoke test message`, etc.). Session titles/IDs in URLs are exempt. Enforced by `preventRecurrenceContract.test.ts`.
12. **Versioning / OTA / store** — JS fixes ship via **EAS Update** (`production` channel, CI `mobile-ota.yml`). New store binaries only for native changes or marketing `expo.version` bumps. Canonical rules: [docs/VERSIONING-AND-RELEASES.md](./docs/VERSIONING-AND-RELEASES.md). Do not claim “every fix needs the store” or invent semver automation that does not exist.

## Autonomous infrastructure (already installed on Igor's Mac)

| Piece | Interval | Check |
|-------|----------|--------|
| LaunchAgent `com.igor.hermes-mobile-continuous-e2e` | 15 min | `npm run e2e:continuous:status` |
| GitHub `mobile-continuous.yml` | 6 h | unit + coverage on push schedule |

Install/repair: `bash ../scripts/install-agent-launchagents.sh` (agent runs this if missing — not the user).

## Verification ladder

| Layer | Command |
|-------|---------|
| Unit | `npm test` / `npm run test:ci` |
| Contract | `npm run test:release-safety` |
| E2E (local) | `npm run e2e:continuous:once` |
| E2E (device release) | `npm run e2e:device` |

Details: [docs/TESTING.md](./docs/TESTING.md).

## Fresh-user onboarding contract (permanent)

**North star:** Every launch is a stranger who knows nothing. One primary CTA per connection state. Silent auto-heal ~30s before numbered human steps.

| State | User sees | Must NOT see |
|-------|-----------|--------------|
| First launch, no saved Mac | `ConnectMacGate` + numbered steps + **Find computers** | "Pair relay", "gateway", "LAN", competing banners |
| Disconnected, saved Mac | Silent heal in `CodexCommandCenter`; after ~30s `ChatConnectionPanel` + steps | "Connected" + "Can't reach" at once |
| Choose Mac modal | Tailscale **Add [name]** at top when tailnet probe succeeds | Mac mini buried only in Settings |
| Cellular, no Tailscale | Step 4 + **Use Tailscale from cellular** title | Home Wi‑Fi IP instructions without context |

**Infer onboarding complete** from valid saved `gatewayProfiles` (no separate flag required).

**Unit tests (required on onboarding copy changes):**

- `src/__tests__/freshUserOnboarding.test.ts` — step copy, heal timing, jargon-free
- `src/__tests__/FreshUserOnboardingCard.test.tsx` — numbered steps render
- `src/__tests__/ChatConnectionPanel.test.tsx` — fresh-user card, single CTA, Tailscale chip

**Maestro:** `connect-mac-gate` must show `connect-mac-onboarding-card` on cold start without demo deep link (future flow); demo bootstrap uses `hermes://setup?demo=1` and hides the gate.

**Copy rules:** Say **Your Mac**, **Home Wi‑Fi**, **Find computers** — never "gateway", "LAN", or "Pair relay" in first-run / disconnected primary UI.

## Prevent recurrence (July 2026)

Playbook: [docs/PREVENT-RECURRENCE-JULY-2026.md](./docs/PREVENT-RECURRENCE-JULY-2026.md). **Session gates:** vault pull + `plan.md` §2 before parallel work; `bash scripts/agent-adb-refresh.sh` before phone/pair; `bash scripts/agent-pre-asc-edit.sh` before ASC review notes; read `docs/proofs/continuous/latest.json` before device/chat ship claims (`e2e=skipped` is not pass). **Cursor:** single-pass — no duplicate subagents on the same file domain or PR.
