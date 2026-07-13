[![Get it on Google Play](https://img.shields.io/badge/Google%20Play-Hermes%20Mobile-414141?logo=googleplay)](https://play.google.com/store/apps/details?id=com.iganapolsky.hermesmobile&referrer=utm_source%3Dgithub%26utm_medium%3Dreadme%26utm_campaign%3Dday0-launch)

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
