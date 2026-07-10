# Hermes Mobile

Expo/React Native operator client for **Hermes** on your computer (macOS, Windows, or Linux) — Chat, Leash approvals, Ops, Settings.

Package: **`com.iganapolsky.hermesmobile`**

Firebase: [docs/FIREBASE_CI.md](./docs/FIREBASE_CI.md)

## Dev

```bash
cd hermes-mobile
npm ci
npm start
```

## Release

Internal QA (Firebase APK): [docs/FIREBASE_CI.md](./docs/FIREBASE_CI.md)

Store (Play Production, Igor Ganapolsky — no tester list): [docs/PLAY_RELEASE.md](./docs/PLAY_RELEASE.md)

```bash
REQUIRE_EAS_PROJECT=1 npm run release:check
npm run test:ci
gh workflow run internal-distribution.yml -f target=android_firebase   # QA
gh workflow run store-release.yml -f platform=android -f submit=true   # Play production
```
