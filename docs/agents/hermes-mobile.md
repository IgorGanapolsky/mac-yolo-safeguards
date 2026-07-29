# Hermes Mobile agent contract — full detail

> Extracted verbatim from `AGENTS.md` on 2026-07-29 to keep the always-injected core small.
> The core keeps the real-users principle; this file holds the full verification table.

## Hermes Mobile — real users product

**Permanent user directive:** Hermes Mobile is a product Igor wants **real users** on — not Igor-only USB dogfood.

**Always treat every test as if it is a brand new user:** no assumed `adb reverse`, no dev backdoor, no saved Mac profiles, release install, cellular/Wi‑Fi realistic paths. If it only works on Igor's cable-connected MacBook, it is **not** ready for external users.

Mobile detail: [hermes-mobile/AGENTS.md](../../hermes-mobile/AGENTS.md), [hermes-mobile/docs/REAL-USER-READINESS.md](../../hermes-mobile/docs/REAL-USER-READINESS.md) when present.

## Hermes Mobile verification contract

**User directive:** Do not wait to be reminded. Agents own verification for `hermes-mobile/`.

| When | Agent action (same turn, no user homework) |
|------|---------------------------------------------|
| Session start | `node tools/agent-session-start.js` — includes pair + continuous E2E status |
| Any edit under `hermes-mobile/src`, `app.json`, `.maestro/` | `npm test` then kickstart `com.igor.hermes-mobile-continuous-e2e` or `npm run e2e:continuous:once` |
| Before "fixed" / "works on device" for chat/UI | Read `latest.json`; `e2e` must be `pass` or report failure honestly |
| Before production OTA | `npm run ota:gate` — requires continuous `e2e=pass` **or** `npm run e2e:fresh-user` proof. Never publish production OTA on unit-green alone (crisis 2026-07-15) |
| LaunchAgent missing | `bash scripts/install-agent-automations.sh` — not "run this install script" to the user |
| Phone USB present | `node tools/hermes-mobile-pair.js` — never "open Settings and paste URL" |
| Phone install / launch | `npm run android:phone` or `scripts/install-phone-release.sh` only — **never** `expo run:android` on a connected device (Metro-only debug → black screen) |

Mobile-specific detail: [hermes-mobile/AGENTS.md](../../hermes-mobile/AGENTS.md).
