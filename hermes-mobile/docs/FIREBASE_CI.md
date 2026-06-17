# Hermes Mobile — Firebase CI/CD

Hermes Mobile ships on the **legacy upgrade package** `com.iganapolsky.agentleash` so Firebase/Play updates reach existing testers. Display name is **Hermes Mobile**; the package ID is intentionally unchanged. See [UPGRADE.md](./UPGRADE.md).

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
| `FIREBASE_SERVICE_ACCOUNT_JSON` or `GOOGLE_SERVICE_ACCOUNT_JSON` | Firebase App Distribution upload |
| `FIREBASE_ANDROID_APP_ID` | Firebase app for **`com.iganapolsky.agentleash`** (existing testers) |
| `FIREBASE_REQUIRED_TESTER_EMAIL` | e.g. `iganapolsky@gmail.com` |

## Required GitHub variables

| Variable | Default |
|---|---|
| `FIREBASE_INTERNAL_GROUPS` | `internal-testers` |

## Firebase setup (already done if you see agentleash invites)

Use the **existing** Android app in Firebase Console:

- Package: `com.iganapolsky.agentleash`
- App ID: GitHub secret `FIREBASE_ANDROID_APP_ID`

Do **not** create a separate `com.iganapolsky.hermesmobile` Firebase app for internal testers unless you intentionally want a parallel beta.

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
| APK package mismatch | `app.json` `android.package` must be `com.iganapolsky.agentleash` |
| Firebase package mismatch | `FIREBASE_ANDROID_APP_ID` must point at the agentleash Firebase app |
| Install blocked (signatures differ) | Align EAS Android keystore with AgentLeash upload key |
| Gmail title still "Hermes Mobile Agent" | Change Firebase **display name** in Console → App settings |
