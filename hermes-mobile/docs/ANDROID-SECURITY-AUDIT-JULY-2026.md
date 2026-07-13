# Android security / compliance audit — July 2026

Evidence-first closure for the external Android audit checklist. Hermes Mobile targets **real users** on Play production (`com.iganapolsky.hermesmobile`, versionCode **12** as of 2026-07-13).

## Summary

| # | Item | Status | Evidence |
|---|------|--------|----------|
| 1 | `SYSTEM_ALERT_WINDOW` | **Already compliant** | `app.json` → `android.blockedPermissions` strips overlay permission from release manifest |
| 2 | Play App Signing | **Documented + enforced** | EAS builds upload key only; Play holds app signing key — see [PLAY_RELEASE.md](./PLAY_RELEASE.md#play-app-signing) |
| 3 | `privacy:scan` | **PASS** | `npm run privacy:scan` — no owner gateway credentials in production source |
| 4 | Dependency bumps | **Deferred (correct)** | Audit cited `react-native@0.84.6`; Expo SDK 55 pins `react-native@0.83.6` — standalone bumps violate AGENTS.md |
| 5 | AAB for Play | **Already compliant** | `eas.json` production `buildType: app-bundle`; `store-release.yml` builds AAB |
| 6 | Legacy storage permissions | **Not present** | No `READ_/WRITE_EXTERNAL_STORAGE` in `app.json` or plugins |
| 7 | ProGuard / R8 | **Enabled + cleaned** | `enableMinifyInReleaseBuilds` + `enableShrinkResourcesInReleaseBuilds`; stale reanimated/gesture-handler keeps removed (G-22) |

## 1. SYSTEM_ALERT_WINDOW

**Before:** Permission could be merged in by transitive Android libraries (debug overlays, dev tooling).

**After:** Explicit block in release config:

```json
"blockedPermissions": [
  "android.permission.RECORD_AUDIO",
  "android.permission.SYSTEM_ALERT_WINDOW"
]
```

Expo `blockedPermissions` removes the permission from the merged release `AndroidManifest.xml` even if a dependency declares it. Hermes does not call `Settings.canDrawOverlays()` or request overlay access in app code.

**Verify:**

```bash
rg 'SYSTEM_ALERT_WINDOW' hermes-mobile/app.json
# → blockedPermissions entry only
```

## 2. Play App Signing

**Before:** Docs described EAS submit but did not state Play App Signing explicitly.

**After:** [PLAY_RELEASE.md](./PLAY_RELEASE.md#play-app-signing) documents:

- EAS holds the **upload key** (managed credentials on Expo).
- Google Play Console holds the **app signing key** (Play App Signing enabled for `com.iganapolsky.hermesmobile`).
- CI never runs `jarsigner` / manual APK signing for store release — only `eas build` → AAB → `eas submit`.

Production track audit (T-157) proved versionCode **12** shipped via this path.

## 3. privacy:scan

**Command:**

```bash
cd hermes-mobile && npm run privacy:scan
```

**Result (2026-07-13):** `Public mobile privacy scan: PASS (no private markers found)`

T-151 added `scan-public-mobile-artifacts.js` and wired it into `store-release.yml`, `mobile-ota.yml`, and CI.

## 4. Dependencies — why `react-native@0.84.6` was skipped

The audit report listed `react-native@0.84.6`. That version does **not** match Expo SDK 55:

| Package | Audit (wrong) | Repo (correct) | Rule |
|---------|---------------|----------------|------|
| `react-native` | 0.84.6 | **0.83.6** | Pinned by Expo SDK 55 |
| `expo` | — | `~55.0.27` | Law: move only via deliberate SDK upgrade |
| `@react-navigation/*` | bump suggested | `^6.x` | Do not standalone-bump alongside RN |

**Action:** None. Use `npx expo install --fix` only during an intentional Expo SDK upgrade — never merge standalone `react-native` / `@react-navigation` bumps from Dependabot or audit tools.

## 5. AAB (Android App Bundle)

**Config:**

```json
// eas.json → build.production.android
"buildType": "app-bundle"
```

Preview / e2e-test profiles intentionally use `apk` for local QA and Maestro. Play production always ships AAB.

**Verify:** `npm run release:check` → `eas.json production android buildType must be app-bundle` ✓

## 6. Storage permissions

Scoped storage is the Android 10+ default. Hermes uses `expo-file-system`, `expo-document-picker`, and `expo-image-picker` — no broad external-storage manifest permissions.

**Verify:**

```bash
rg 'READ_EXTERNAL_STORAGE|WRITE_EXTERNAL_STORAGE|MANAGE_EXTERNAL_STORAGE' hermes-mobile
# → no matches in source/manifest config
```

## 7. ProGuard / R8

**Config** (`expo-build-properties` in `app.json`):

- `enableMinifyInReleaseBuilds: true` — R8 code shrink/obfuscate
- `enableShrinkResourcesInReleaseBuilds: true` — unused resource removal
- `extraProguardRules` — keep rules for **shipped** native modules only:
  - Play Billing (`expo-iap`)
  - ML Kit / barhopper (`expo-camera` QR)
  - JNI native-method safety net

**Fix applied:** Removed stale `-keep` rules for `react-native-reanimated` and `react-native-gesture-handler` (not direct dependencies — G-22).

**Verify:** `npm run test:release-safety` → `Android security audit (Jul 2026)` suite.

## Regression gates

| Gate | Command |
|------|---------|
| Release readiness | `npm run release:check` |
| Contract tests | `npm run test:release-safety` |
| Privacy | `npm run privacy:scan` |
| Unit (scoped) | `npm test -- --no-coverage --watchman=false src/__tests__/releaseSafetyContract.test.ts` |
