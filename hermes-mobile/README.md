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

## Related repo tooling

- `tools/hermes-productivity-audit.js` — gateway health on the Mac
- `sim-runaway-guard.sh` — YOLO memory reclaim events (future `RECLAIM.FIRED` source)
