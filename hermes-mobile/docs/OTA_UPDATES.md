# Hermes Mobile — EAS OTA updates

Hermes Mobile ships JS and asset fixes over the air (EAS Update) so Igor's phone and production users receive fixes merged to `main` without reinstalling the APK for every change.

## Channel strategy

| Channel | Build profile | OTA publish | Audience |
|---------|---------------|-------------|----------|
| `production` | `eas.json` → `build.production` | **Fresh-user gated** — `npm run ota:publish` / workflow_dispatch only after `e2e=pass` | Store / release APK |
| `preview` | `build.preview` | `main` push (CI) or `npm run ota:preview` | Internal EAS preview APK |
| `e2e-test` | `build.e2e-test` | `npm run ota:e2e` | Maestro / automation builds |

**Crisis 2026-07-15:** Production OTA is **not** automatic on every `main` merge. CI publishes **preview** on push; **production** requires `workflow_dispatch` with `publish_production=true` plus a fresh-user / continuous proof artifact (`e2e=pass`). Local: `npm run ota:gate` then `npm run ota:publish`. See [PRODUCTION-CRISIS-2026-07-15.md](./PRODUCTION-CRISIS-2026-07-15.md).

**Previously:** Production channel received automatic OTA from `.github/workflows/mobile-ota.yml` on every push — that shipped live bugs without brand-new-user proof.

## Fresh-user / stranger cold-start gate (hard)

Production OTA **hard-fails** unless stranger cold-start proof is present:

1. Structural contract: `mobile-e2e.yml` stranger job + `.maestro/stranger-cold-start.yaml` (no `demo=1`, `EXPO_PUBLIC_E2E_AUTOMATION=0`).
2. Runtime proof: proof JSON with `strangerColdStart=pass`, **or** GitHub check `Maestro stranger cold-start (Android emulator)` = success on the publish SHA (CI waits for the parallel emulator job).

Implemented by `scripts/require-stranger-cold-start-proof.cjs` (hard by default). Soft opt-out (`--soft` / `HERMES_OTA_REQUIRE_STRANGER_PROOF=0`) is for local dry-runs only.


## Runtime version policy: `appVersion`

`app.json` uses:

```json
"runtimeVersion": { "policy": "appVersion" }
```

**Why `appVersion` (not fingerprint):**

- OTA bundles only apply to native builds whose embedded runtime matches marketing `expo.version` (e.g. `1.0`, `1.1`).
- EAS production uses `cli.appVersionSource: "remote"` + `autoIncrement` for **native build numbers**. Do not treat stale local `buildNumber` / `versionCode` in `app.json` as source of truth.
- Bumping `app.json` `version` **splits** the OTA line: ship a new native store binary for that version, then publish OTA for the new runtime.

Fingerprint would auto-split on any native drift but adds CI complexity and can block OTA when Gradle/plugin noise changes without user-visible native changes. Full process: [VERSIONING-AND-RELEASES.md](./VERSIONING-AND-RELEASES.md).

## How the phone receives updates

1. **Launch check** — `updates.checkAutomatically: ON_LOAD` (disabled for E2E automation builds).
2. On cold start, `expo-updates` checks `https://u.expo.dev/4ed13e30-9b97-4ddd-8a12-59106cae90d6` on the `production` channel (via `requestHeaders.expo-channel-name` in `app.config.js`, or EAS build embedding).
3. If a newer compatible bundle exists, the app downloads it and applies it on the **next** restart (default Expo behavior).
4. No manual "Check for updates" UI — fixes land after kill + reopen, or background fetch on subsequent launches.

## One-time native rebuild required

**Yes** — any APK installed before OTA was enabled (`updates.enabled: false`) will not fetch updates even though `expo-updates` is in `plugins`.

After merging this setup:

```bash
cd hermes-mobile && npm run android:phone
```

Or queue an EAS production build. After that one install, `main` merges deliver JS fixes via OTA.

## What OTA can and cannot fix

| OTA-safe (JS/assets) | Requires native rebuild |
|----------------------|-------------------------|
| React screens, hooks, copy | New native modules (`expo install` with native code) |
| TypeScript logic, API clients | `app.json` plugin changes |
| Images, fonts in bundle | Expo SDK upgrade |
| `EXPO_PUBLIC_*` env at publish time | `runtimeVersion` / app version bump |
| Maestro-visible UI fixes | Android permissions, ProGuard, signing |

`EXPO_PUBLIC_*` values are **baked at OTA publish time** (CI uses EAS `production` environment secrets). They are not read from the phone at runtime.

## Local commands

```bash
cd hermes-mobile
npm run ota:validate   # config + EAS project checks (no publish)
npm run ota:publish    # manual production publish (same as CI)
npm run ota:preview    # preview channel
```

Requires `EXPO_TOKEN` in the environment (never commit).

## CI

- **Workflow:** `.github/workflows/mobile-ota.yml`
- **Trigger:** push to `main` (paths `hermes-mobile/**`) or manual `workflow_dispatch`
- **Steps:** unit + release-safety → `eas update --channel production --environment production`
- **Secret:** `EXPO_TOKEN` (repo secret, already used by store/internal workflows)

## Complements release APK path

`npm run android:phone` / `install-phone-release.sh` remains the supported USB install path. OTA complements it — it does not replace store submits or Firebase internal distribution.
