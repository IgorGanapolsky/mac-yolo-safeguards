# Hermes Mobile — EAS OTA updates

Hermes Mobile ships JS and asset fixes over the air (EAS Update) so Igor's phone and production users receive fixes merged to `main` without reinstalling the APK for every change.

## Channel strategy

| Channel | Build profile | OTA publish | Audience |
|---------|---------------|-------------|----------|
| `production` | `eas.json` → `build.production` | **Fresh-user gated** — `npm run ota:publish` / workflow_dispatch only after `e2e=pass` | Store / release APK |
| `preview` | `build.preview` | `main` push (CI) or `npm run ota:preview` | Internal EAS preview APK |
| `e2e-test` | `build.e2e-test` | `npm run ota:e2e` | Maestro / automation builds |

**Crisis 2026-07-15 (updated):** Production OTA is **not** automatic on every `main` merge. CI publishes **preview** on push; **production** requires `workflow_dispatch` with `publish_production=true` plus a fresh-user / continuous proof artifact (`e2e=pass`), then publishes with **staged `--rollout-percentage`** (default 10%; promote via `promote_production_rollout`). Play **1.0/vc14** NSC is on the production track — still do **not** claim all installs updated. OTA cannot deliver native NSC. Law: [VERSIONING-AND-RELEASES-JULY-2026.md](./VERSIONING-AND-RELEASES-JULY-2026.md). Local: `npm run ota:gate` then `npm run ota:publish`.

**Previously:** Production channel received automatic OTA from `.github/workflows/mobile-ota.yml` on every push — that shipped live bugs without brand-new-user proof.

## Runtime version policy: `appVersion`

`app.json` uses:

```json
"runtimeVersion": { "policy": "appVersion" }
```

**Why `appVersion` (not fingerprint):**

- OTA bundles only apply to native builds whose embedded runtime matches marketing `expo.version` (e.g. `1.0`, `1.1`).
- EAS production uses `cli.appVersionSource: "remote"` + `autoIncrement` for **native build numbers**. Do not treat stale local `buildNumber` / `versionCode` in `app.json` as source of truth.
- Bumping `app.json` `version` **splits** the OTA line: ship a new native store binary for that version, then publish OTA for the new runtime.
- **Crisis 2026-07-15:** Play production is still marketing/runtime **0.3.2** (versionCode 12). Runtime **1.0** OTAs cannot repair those installs until a Play **1.0** binary is live. iOS public **1.0** can take JS OTA. Law: [VERSIONING-AND-RELEASES-JULY-2026.md](./VERSIONING-AND-RELEASES-JULY-2026.md).

Fingerprint would auto-split on any native drift but adds CI complexity and can block OTA when Gradle/plugin noise changes without user-visible native changes. Full process: [VERSIONING-AND-RELEASES.md](./VERSIONING-AND-RELEASES.md).

## How the phone receives updates

1. **Silent launch check** — `updates.checkAutomatically: ON_LOAD` (disabled for E2E automation builds). On cold start, `expo-updates` checks `https://u.expo.dev/4ed13e30-9b97-4ddd-8a12-59106cae90d6` on the `production` channel (via `requestHeaders.expo-channel-name` in `app.config.js`, or EAS build embedding). When a compatible bundle is newer, Expo downloads it in the background (no store reinstall).
2. **First-session onboarding** — before a saved computer exists, a downloaded or available update applies silently. Neither path blocks Connect your computer with a restart decision.
3. **In-app banner** — after onboarding, `OtaUpdateBanner` (mounted from `App.tsx`) surfaces when an update is **available** (not yet downloaded) or **pending** (downloaded, restart required). Dismiss hides the banner for the session; **Download & restart** / **Restart** applies immediately.
4. **Alert prompt** — after onboarding, the same hook fires a one-time `Alert.alert('Update available', …)` per app session when state first becomes available or pending (in addition to the banner).
5. **Settings manual check** — **Connection health** hub includes **Check for update** for on-demand fetch when ON_LOAD missed an edge case.
6. **Runtime version gate** — OTAs only apply when `runtimeVersion` matches the installed binary (`policy: appVersion` in `app.json`). The Play production train for Hermes Mobile is **1.0**; a **1.1** APK will **not** receive production OTAs published for runtime **1.0** (install the 1.0 release APK, then JS fixes arrive via OTA).

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
- **Production (law):** not automatic on `main`; gated dispatch + fresh-user `e2e=pass`; staged `--rollout-percentage` (default 10%) when publishing production
- **Promote:** workflow_dispatch `promote_production_rollout` (e.g. `100`) → `eas update:edit`
- **Code signing:** optional `EXPO_UPDATE_PRIVATE_KEY` PEM secret → `--private-key-path` ([Expo code signing](https://docs.expo.dev/eas-update/code-signing/)); requires cert embedded in a native binary first
- **Secret:** `EXPO_TOKEN` (required)

## Complements release APK path

`npm run android:phone` / `install-phone-release.sh` remains the supported USB install path. OTA complements it — it does not replace store submits or Firebase internal distribution.
