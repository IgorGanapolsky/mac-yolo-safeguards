# Hermes Mobile — Firebase CI/CD

Package: **`com.iganapolsky.hermesmobile`** · Firebase/GCP project **`hermes-mobile-dist-78361`** (display name: Hermes Mobile)

Canonical IDs: [`firebase-project.json`](../firebase-project.json)

## Firebase Android app

| Field | Value |
|---|---|
| Package | `com.iganapolsky.hermesmobile` |
| App ID | `1:889503668479:android:8fb27423dc575f2d3094ca` |
| GCP project number | `889503668479` |
| Display name | `Hermes Mobile` |

CI rejects APKs labeled **Hermes Mobile Agent** (legacy native shell) — only the Expo app ships.

## GitHub secrets

| Secret | Purpose |
|---|---|
| `EXPO_TOKEN` | EAS cloud builds |
| `FIREBASE_SERVICE_ACCOUNT_JSON` | SA with `firebaseappdistro.admin` on **`hermes-mobile-dist-78361`** (`firebase-distributor@...`) |
| `FIREBASE_ANDROID_APP_ID` | `1:889503668479:android:8fb27423dc575f2d3094ca` |
| `FIREBASE_REQUIRED_TESTER_EMAIL` | `iganapolsky@gmail.com` (Android only — not the iOS Apple ID) |

Generate a service account key: [Firebase Console → Hermes Mobile → Project settings → Service accounts](https://console.firebase.google.com/project/hermes-mobile-dist-78361/settings/serviceaccounts/adminsdk), or use the `firebase-distributor` SA.

Sync:

```bash
FIREBASE_SERVICE_ACCOUNT_JSON_PATH=~/path/to/hermes-firebase-sa.json \
  ./scripts/sync-firebase-secrets.sh
```

## Manual distribute

```bash
gh workflow run internal-distribution.yml -f target=android_firebase
```

## Failure modes

| Symptom | Fix |
|---|---|
| Orange bell / “Hold the cord” UI | Wrong APK (native shell). Uninstall, wait for green CI from this repo only |
| `403` on distribute | SA must be on `hermes-mobile-dist-78361`, not another GCP project |
| APK verify failed | EAS must build `hermes-mobile/` Expo app; check `verify-apk-package.sh` logs |
