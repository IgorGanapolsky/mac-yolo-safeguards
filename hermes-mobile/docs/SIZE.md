# Hermes Mobile — Android APK / AAB size

**Last measured:** 2026-06-27  
**Evidence:** local `app-release.apk`, EAS artifact from run [28267365363](https://github.com/IgorGanapolsky/mac-yolo-safeguards/actions/runs/28267365363) (commit `afa37a3`).

---

## Why Firebase showed ~100 MB

Firebase App Distribution ships the **EAS `preview` profile APK** from [internal-distribution.yml](../../.github/workflows/internal-distribution.yml):

```yaml
eas build --platform android --profile preview
```

That build is a **release APK** (not a dev client), but EAS defaults to **all four ABIs** unless constrained:

| ABI | Native libs (uncompressed) | Needed for real phones? |
|-----|---------------------------|-------------------------|
| `arm64-v8a` | ~19 MB | **Yes** — all modern Android phones |
| `armeabi-v7a` | ~13 MB | Legacy 32-bit ARM (rare in 2026) |
| `x86` | ~21 MB | Emulators only |
| `x86_64` | ~20 MB | Emulators only |

**Root cause:** `android/gradle.properties` had `reactNativeArchitectures=armeabi-v7a,arm64-v8a,x86,x86_64`. Local USB release scripts pass `-PreactNativeArchitectures=arm64-v8a`; **EAS did not**, so the Firebase APK bundled ~74 MB of native `.so` files instead of ~19 MB.

Not the cause:

- **Dev client** — only `development` profile sets `developmentClient: true`; Firebase uses `preview`.
- **Debug build** — preview builds release; embedded JS bundle is expected.
- **Duplicate JS bundle** — single `assets/index.android.bundle` (~1.9 MB HBC).
- **Dev unlock env** — `EXPO_PUBLIC_HERMES_DEV_UNLOCK=1` is compile-time only; negligible size impact.

---

## Size breakdown (v0.3.1 / versionCode 5)

| Component | Local release (arm64-only) | EAS preview before fix (4 ABIs) |
|-----------|---------------------------|----------------------------------|
| **APK on disk** | **~43 MB** | **~95–100 MB** |
| Native `.so` | ~19 MB (1 ABI) | ~74 MB (4 ABIs) |
| DEX (Java/Kotlin) | ~37 MB | ~37 MB |
| JS bundle (`index.android.bundle`) | ~1.9 MB | ~1.9 MB |
| Assets (ML Kit barcode models, etc.) | ~2.7 MB | ~2.7 MB |
| Resources / other | ~4 MB | ~4 MB |

JS bundle analysis: `npm run analyze:bundle` → **~1938 KB** HBC (under 8192 KB budget).

---

## What real users should get

| Channel | Format | Target download size | Notes |
|---------|--------|---------------------|-------|
| **Firebase internal QA** | arm64 release APK | **~40–45 MB** | Matches local `npm run android:phone` |
| **Google Play** | AAB (`production` profile) | **~25–35 MB** on device | Play serves ABI-specific splits from AAB |
| **USB dev (Igor)** | arm64 release APK | ~43 MB | `install-phone-release.sh` already arm64-only |

Play Production uses **`production`** profile → `buildType: app-bundle`, no dev unlock, PostHog only.

---

## Fix (2026-06-27)

1. **`app.json`** — `expo-build-properties` → `buildArchs: ["arm64-v8a"]` (prebuild / all EAS profiles).
2. **`eas.json`** — `ORG_GRADLE_PROJECT_reactNativeArchitectures=arm64-v8a` on `preview` and `production` env (EAS belt-and-suspenders; some SDK versions ignore `buildArchs` alone).

After the next green `internal-distribution.yml` run, Firebase should show **~43 MB**, not ~100 MB.

---

## Recommended EAS profiles

| Profile | Use | Android output | ABIs | Dev unlock |
|---------|-----|----------------|------|------------|
| `development` | Metro / dev client | debug | all (default) | yes |
| `preview` | **Firebase App Distribution** | release APK | **arm64-v8a** | yes (Igor QA) |
| `production` | **Play Store / App Store** | AAB / IPA | **arm64-v8a** | no |
| `e2e-test` | CI Maestro | APK | all (simulators) | yes |

### Next Firebase build

Trigger after merge:

```bash
gh workflow run internal-distribution.yml -f target=android_firebase
```

Verify artifact `eas-android-internal-evidence` APK is **< 50 MB** and contains only `lib/arm64-v8a/`.

### Play Store

Keep `production` as AAB — do **not** upload universal fat APKs to Play. Play generates per-device splits automatically.

---

## Related

- [FIREBASE_CI.md](./FIREBASE_CI.md) — Firebase workflow
- [PLAY_RELEASE.md](./PLAY_RELEASE.md) — Play submit
- [REAL-USER-READINESS.md](./REAL-USER-READINESS.md) — external beta gates
