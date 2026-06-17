# Hermes Mobile — in-place upgrade (Android / iOS)

## Why Firebase still shows `com.iganapolsky.agentleash`

The **application ID** is the install identity on device and in Firebase/Play. We keep the legacy ID so existing testers get **updates**, not a side-by-side second app.

| Field | Value | User sees |
|---|---|---|
| Display name | **Hermes Mobile** | App icon label, Firebase title |
| Android package | `com.iganapolsky.agentleash` | Technical ID (unchanged) |
| iOS bundle ID | `com.iganapolsky.agentleash` | Technical ID (unchanged) |
| Slug / EAS project | `hermes-mobile` | Expo dashboard only |

**Do not** ship `com.iganapolsky.hermesmobile` or `com.iganapolsky.hermesmobileagent` to the existing Firebase app — stores treat those as different apps. Users would lose local pairing data and need a fresh install.

## What changed in 0.2.0

- Expo **Hermes Mobile** (Chat / Leash / Ops / Settings) replaces the old native AgentLeash shell **under the same package ID**.
- `versionCode` **188** (prior native release was **187**) so Android accepts the build as an upgrade.
- CI uploads to the **existing** Firebase Android app (`FIREBASE_ANDROID_APP_ID` for `com.iganapolsky.agentleash`).

## Signing (required for real OTA on device)

EAS must sign with the **same Android keystore** as the native AgentLeash releases. If signatures differ, Android will reject the install as an update.

```bash
cd hermes-mobile
eas credentials -p android   # upload / select AgentLeash upload keystore
```

## Firebase CI

See [FIREBASE_CI.md](./FIREBASE_CI.md). The pipeline **expects** `com.iganapolsky.agentleash` — that is correct for upgrade, not a misconfiguration.

## Tester steps

1. Uninstall only if the install fails with a signature mismatch (after keystore is aligned).
2. Otherwise: install from the new Firebase invite — it should upgrade in place.
3. Display name should read **Hermes Mobile**; package in Firebase details remains `com.iganapolsky.agentleash`.
