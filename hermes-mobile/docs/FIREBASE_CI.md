# Hermes Mobile — Firebase CI/CD

Package: **`com.iganapolsky.hermesmobile`** · Firebase project **`openclaw-console-mobile-8d53d`**

**Not LipoShield.** Do not use `liposhield-distribution` or `mirror-liposhield-secrets.sh` for Firebase — that project shares testers with the LipoShield app and will send the wrong invite emails.

## Firebase Android app (Hermes-only)

| Field | Value |
|---|---|
| Package | `com.iganapolsky.hermesmobile` |
| App ID | `1:587028054730:android:00258f23e47d56f6772a33` |
| Display name | `hermes-mobile` |

## GitHub secrets

| Secret | Purpose |
|---|---|
| `EXPO_TOKEN` | EAS cloud builds |
| `FIREBASE_SERVICE_ACCOUNT_JSON` | SA with `firebaseappdistro.admin` on **openclaw-console-mobile-8d53d** |
| `FIREBASE_ANDROID_APP_ID` | `1:587028054730:android:00258f23e47d56f6772a33` |
| `FIREBASE_REQUIRED_TESTER_EMAIL` | e.g. `iganapolsky@gmail.com` |

Sync:

```bash
FIREBASE_SERVICE_ACCOUNT_JSON_PATH=~/path/to/openclaw-firebase-sa.json \
  ./scripts/sync-firebase-secrets.sh
```

## Manual distribute

```bash
gh workflow run internal-distribution.yml -f target=android_firebase
```

## Failure modes

| Symptom | Fix |
|---|---|
| LipoShield email instead of Hermes | Wrong Firebase project — use app ID above, not LipoShield's |
| `403` on distribute | SA must be on openclaw project, not Random Timer / LipoShield Play SA |
| APK package mismatch | `app.json` → `com.iganapolsky.hermesmobile` |
