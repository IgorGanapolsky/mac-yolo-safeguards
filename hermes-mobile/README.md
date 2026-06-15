# Hermes Mobile

Mobile companion for the Hermes gateway — **ThumbGate approvals**, gateway health, and YOLO safeguard telemetry. Built with the same Expo + React Navigation patterns as [LipoShield](../../LipoShield).

## Quick start

```sh
cd hermes-mobile
npm install
npm run typecheck
npm run test:ci
npx expo start
```

## v0.1 scope

- Gateway health pill (`/health/detailed` → `/health` fallback)
- Secure API key storage (`expo-secure-store`)
- WebSocket listener for `GATE.BLOCKED` / `RECLAIM.FIRED` (see `ARCHITECTURE.md`)
- Demo mode for UI without live gateway WS
- Approvals screen with approve/reject + haptics

See [ARCHITECTURE.md](./ARCHITECTURE.md) for API contracts and phased roadmap.

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

## Related repo tooling

- `tools/hermes-productivity-audit.js` — gateway health on the Mac
- `sim-runaway-guard.sh` — YOLO memory reclaim events (future `RECLAIM.FIRED` source)
