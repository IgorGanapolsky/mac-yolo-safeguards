# Hermes Mobile — architecture

**Hermes Mobile** replaces Telegram DM and mirrors Hermes desktop/CLI (`:8642`).

| Field | Value |
|---|---|
| Android package / iOS bundle | `com.iganapolsky.hermesmobile` |
| Cloud relay | `https://hermesmobile-cloud.fly.dev` |
| Firebase app | `1:889503668479:android:8fb27423dc575f2d3094ca` on `hermes-mobile-dist-78361` |

## Operator accounts

| Platform | Email | Used for |
|---|---|---|
| Android (Firebase / GCP) | `iganapolsky@gmail.com` | Firebase App Distribution, GCP |
| Android (Play) | `iganapolsky@gmail.com` | IgorGanapolsky developer page — Play Console admin + API access |
| iOS | `igor.ganapolsky@icloud.com` | App Store Connect, TestFlight, `EXPO_APPLE_ID` |

Play production releases: [docs/PLAY_RELEASE.md](docs/PLAY_RELEASE.md) — **Production** track, no tester list.

Canonical constants: [`src/constants/appIdentity.ts`](src/constants/appIdentity.ts)

| Tab | Role |
|---|---|
| **Chat** | Primary — sessions, streaming replies (Telegram replacement) |
| **Leash** | Optional safety — ThumbGate approve/reject when Mac **blocks** a tool |
| **Ops** | Cron jobs, skills, health |
| **Settings** | Gateway tunnel, **Safety mode**, Mac pairing |

**Default launch tab:** Chat. Turn on **Safety mode** or **Glance mode** in Settings to open Leash first (ThumbGate / glasses persona).
