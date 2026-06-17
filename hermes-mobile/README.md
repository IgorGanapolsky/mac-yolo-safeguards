# Hermes Mobile

**Mobile Hermes — replaces Telegram DM** for talking to your Mac agent, plus approve/deny tool calls from the couch.

Built with Expo + React Navigation. Gateway API on port **8642** — chat, streaming, skills, cron jobs, approvals (same tunnel as Telegram).

**Positioning:** App Store name **Hermes Mobile**; product subtitle **Hermes Mobile Agent** (mobile operator client for your Mac Hermes agent).

## v0.1 scope

- **Chat** — sessions, history, **streaming** replies, live tool progress
- **Leash** — Hermes Mobile Agent / ThumbGate approve/reject
- **Ops** — skills, toolsets, cron jobs (`/v1/skills`, `/api/jobs`), gateway health
- **Settings** — tunnel + `API_SERVER_KEY`; cloud relay pairing for LTE

### Pair with your Mac (Hermes Mobile Agent)

On your Mac, run **Hermes Mobile Agent pairing** (bridge daemon) and enter the code shown in Terminal.

In Hermes Mobile **Settings**, enter the pairing code (e.g. `MOON-DUST`) and cloud URL (`https://hermes-mobile-cloud.fly.dev`).

**Firebase App Distribution:** invites must use the **Hermes Mobile** Android app in Firebase Console (`com.iganapolsky.hermesmobile`). If Gmail shows the wrong app name, the `FIREBASE_ANDROID_APP_ID` GitHub secret points at the wrong Firebase app — register Hermes Mobile and update the secret.

## Quick start

```sh
cd hermes-mobile
npm install
npm run typecheck
npm run test:ci
npx expo start
```

See [ARCHITECTURE.md](./ARCHITECTURE.md) for the full desktop/CLI parity map.


## EAS (Expo Application Services)

Project: [@igorganapolsky/hermes-mobile](https://expo.dev/accounts/igorganapolsky/projects/hermes-mobile)

| Field | Value |
|---|---|
| Project ID | `4ed13e30-9b97-4ddd-8a12-59106cae90d6` |
| Updates URL | `https://u.expo.dev/4ed13e30-9b97-4ddd-8a12-59106cae90d6` |
| OTA channels | `development`, `preview`, `e2e-test`, `production` |

```sh
# Link (already done — re-run only if projectId drifts)
eas init --id 4ed13e30-9b97-4ddd-8a12-59106cae90d6 --force --non-interactive

# Local internal APK (preview profile)
eas build --platform android --profile preview

# OTA publish (after a channel-linked build is installed)
npm run ota:preview
```

CI/CD workflows in the parent repo (`internal-distribution.yml`, `store-release.yml`) need the same GitHub secrets as LipoShield (`EXPO_TOKEN`, Firebase trio, Google Play JSON, ASC keys). Run `./scripts/mirror-liposhield-secrets.sh` from the parent repo root.

**Firebase internal builds:** see [docs/FIREBASE_CI.md](./docs/FIREBASE_CI.md). Pushes to `main` that touch `hermes-mobile/**` auto-trigger EAS → Firebase distribution (`com.iganapolsky.hermesmobile`).

## Related repo tooling

- `tools/hermes-productivity-audit.js` — gateway health on the Mac
- `sim-runaway-guard.sh` — YOLO memory reclaim events (future `RECLAIM.FIRED` source)
