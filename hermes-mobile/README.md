# Hermes Mobile

Expo/React Native operator client for **Hermes** on your Mac — Chat, Leash approvals, Ops, Settings.

Package: **`com.iganapolsky.hermesmobile`**

Firebase: [docs/FIREBASE_CI.md](./docs/FIREBASE_CI.md) — **not** LipoShield.

## Dev

```bash
cd hermes-mobile
npm ci
npm start
```

## Release

```bash
REQUIRE_EAS_PROJECT=1 npm run release:check
npm run test:ci
gh workflow run internal-distribution.yml -f target=android_firebase
```
