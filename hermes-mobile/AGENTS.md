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
