# Hermes Mobile — architecture

**Hermes Mobile** replaces Telegram DM and mirrors Hermes desktop/CLI (`:8642`).

| Field | Value |
|---|---|
| Android package / iOS bundle | `com.iganapolsky.hermesmobile` |
| Cloud relay | `https://hermes-mobile-cloud.fly.dev` |
| Firebase app | `1:786594199351:android:446b6eceab722fe7344cb2` on `hermes-mobile-distribution` |

## Operator accounts

| Platform | Email | Used for |
|---|---|---|
| Android (Firebase / GCP) | `iganapolsky@gmail.com` | Firebase App Distribution, GCP |
| Android (Play) | `iganapolsky@gmail.com` | **Organization (LLC)** Play Console admin + API access |
| iOS | `igor.ganapolsky@icloud.com` | App Store Connect, TestFlight, `EXPO_APPLE_ID` |

Play production releases: [docs/PLAY_RELEASE.md](docs/PLAY_RELEASE.md) — **Production** track, no tester list.

Canonical constants: [`src/constants/appIdentity.ts`](src/constants/appIdentity.ts)

| Tab | Role |
|---|---|
| **Chat** | Sessions, streaming replies |
| **Leash** | ThumbGate approve/reject |
| **Ops** | Cron jobs, skills, health |
| **Settings** | Gateway tunnel + Mac pairing |
