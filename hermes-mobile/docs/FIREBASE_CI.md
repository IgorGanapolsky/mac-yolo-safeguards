# Hermes Mobile — Firebase CI/CD

Hermes Mobile (`com.iganapolsky.hermesmobile`) is **not** AgentLeash / Hermes Mobile Agent (`com.iganapolsky.agentleash`). CI enforces both Firebase app binding and APK package checks before upload.

## Pipelines (June 2026)

| Trigger | Workflow | Result |
|---|---|---|
| Push to `main` (`hermes-mobile/**`) | `.github/workflows/internal-distribution.yml` | EAS preview APK → Firebase App Distribution |
| Manual | `workflow_dispatch` target `android_firebase` | Same |
| Optional native | `hermes-mobile/.eas/workflows/firebase-android.yml` | EAS Workflows → Firebase (secrets in Expo env) |

## Required GitHub secrets

| Secret | Purpose |
|---|---|
| `EXPO_TOKEN` | EAS cloud builds |
| `FIREBASE_SERVICE_ACCOUNT_JSON` | Firebase App Distribution upload |
| `FIREBASE_ANDROID_APP_ID` | Must be the **Hermes Mobile** Android app (`1:…:android:…`) |
| `FIREBASE_REQUIRED_TESTER_EMAIL` | e.g. `iganapolsky@gmail.com` |

## Required GitHub variables

| Variable | Default |
|---|---|
| `FIREBASE_INTERNAL_GROUPS` | `internal-testers` |

## One-time Firebase setup

1. [Firebase Console](https://console.firebase.google.com) → your project → **Add app** → Android
2. Package name: **`com.iganapolsky.hermesmobile`** (exact)
3. Copy the **App ID** (`1:PROJECT_NUMBER:android:HEX`)
4. Update GitHub secret `FIREBASE_ANDROID_APP_ID` (mirror from LipoShield `.env` or set manually):

```bash
./scripts/mirror-liposhield-secrets.sh   # after FIREBASE_ANDROID_APP_ID is correct in LipoShield/.env
```

## Local verification

```bash
cd hermes-mobile
REQUIRE_EAS_PROJECT=1 npm run release:check
npm run launch:preflight:android
```

## Manual Firebase distribute

```bash
gh workflow run internal-distribution.yml -f target=android_firebase
```

## Failure modes

| Symptom | Fix |
|---|---|
| `runtimeVersion.policy must be appVersion` | `app.json` → `"runtimeVersion": { "policy": "appVersion" }` |
| Firebase app is `com.iganapolsky.agentleash` | Wrong `FIREBASE_ANDROID_APP_ID` — register Hermes Mobile app |
| APK package mismatch | EAS built wrong project — check `app.json` `android.package` |
| Gmail says "AgentLeash" | Firebase app registration still points at old package |
