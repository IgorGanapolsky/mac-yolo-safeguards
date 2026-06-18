# Hermes Mobile — testing

## Layers (prevents shipping broken APKs)

| Layer | Command | Catches |
|---|---|---|
| Release safety unit tests | `npm run test:release-safety` | Debug APK without JS bundle, legacy shell, wrong package/Firebase IDs |
| Full unit + coverage gate | `npm run test:ci` | Regressions; `apkReleaseGuards.ts` ≥90% lines |
| APK verify (pre-Firebase) | `npm run verify:apk -- path/to.apk` | Missing `index.android.bundle`, wrong package, legacy UI strings |
| Maestro ship-guard | `npm run e2e:ship-guard` | Red screen "Unable to load script", orange onboarding shell |
| Full device E2E | `npm run e2e:device` | Build release → verify → install → Maestro (phone required) |

## Device E2E (Android phone USB)

```bash
cd hermes-mobile
adb devices   # must show one device
npm run e2e:device
```

Runs: `assembleRelease` → APK verify → install → `ship-guard` + `launch` + `navigation` + `approvals`.

## iOS simulator

```bash
cd hermes-mobile
npx expo run:ios --device "iPhone 17 Pro"
npx expo start --dev-client   # separate terminal for Metro
npm run e2e:ship-guard
```

For standalone simulator build without Metro, use a release/archive build (future).

## CI

- **Every PR/push:** `mobile-checks` job — typecheck, doctor, `test:ci` with coverage thresholds.
- **Internal distribution:** quality gate + `verify-apk-package` before Firebase upload.
- **Local mirror:** `./scripts/ci-verify.sh` from repo root.

## Crises this suite blocks

1. **Debug APK to Firebase** → no `assets/index.android.bundle` → unit test + verify script FAIL.
2. **Legacy native shell** → Maestro `ship-guard` + APK string scan FAIL.
3. **Wrong Firebase/Play project** → `releaseSafetyContract` + `appIdentity` tests FAIL.
4. **Metro red screen on device** → Maestro `assertNotVisible: "Unable to load script"` FAIL.
