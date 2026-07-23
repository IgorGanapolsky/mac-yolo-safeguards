# Hermes Mobile — EAS OTA updates

Hermes Mobile ships JS and asset fixes over the air (EAS Update) so Igor's phone and production users receive fixes merged to `main` without reinstalling the APK for every change.

## Channel strategy

| Channel | Build profile | OTA publish | Audience |
|---------|---------------|-------------|----------|
| `production` | `eas.json` → `build.production` | **Billing thaw + fresh-user gated** — batched tip-of-day `workflow_dispatch` only | Store / release APK |
| `preview` | `build.preview` | Opt-in `workflow_dispatch` + `publish_preview=true` (no push auto-publish) | Internal EAS preview APK |
| `e2e-test` | `build.e2e-test` | `npm run ota:e2e` | Maestro / automation builds |

**Billing freeze 2026-07-23:** Expo Visa 2394 failed a **$78** subscription charge after agents burned EAS Update (`mobile-ota.yml` **121 runs / 48h**, including preview-on-every-main-push + many production dispatches). Workflow is **disabled_manually** on GitHub. Local/`ota:publish` refused by `scripts/require-expo-billing-thaw.sh` unless `HERMES_OTA_BILLING_THAW=1`. **Merge PRs OK; OTA deferred** until billing works. Then batch **one** coherent tip-of-day publish — never one OTA per small PR.

**Crisis 2026-07-15 (updated):** Production OTA is **not** automatic on every `main` merge. Preview is **not** automatic either (removed 2026-07-23). **Production** requires `workflow_dispatch` with `publish_production=true` plus a fresh-user / continuous proof artifact (`e2e=pass`), then publishes with **staged `--rollout-percentage`** (default 10%; promote via `promote_production_rollout`). OTA cannot deliver native NSC. Law: [VERSIONING-AND-RELEASES-JULY-2026.md](./VERSIONING-AND-RELEASES-JULY-2026.md). Local: thaw + `npm run ota:gate` then `npm run ota:publish`.

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

1. **Silent launch check** — `updates.checkAutomatically: ON_LOAD` when billing is thawed (disabled for E2E automation builds). **Billing freeze 2026-07-23:** `app.config.js` sets `updates.enabled=false` + `checkAutomatically=NEVER` until `HERMES_OTA_BILLING_THAW=1` / floor date — native ON_LOAD must not replace a local `android:phone` APK with a CDN OTA ("Applying update…"). Downloading an already-published CDN update does not create a new Expo *bill*, but it **does** wipe the embedded JS and can destroy USB dogfood. JS also hard-blocks `reloadAsync` / banner / Alert via `otaClientPromptPolicy`.
2. **First-session onboarding** — before a saved computer exists, a downloaded or available update applies silently (when prompts are not suppressed). Neither path blocks Connect your computer with a restart decision.
3. **In-app banner** — after onboarding, `OtaUpdateBanner` (mounted from `App.tsx` **above** nav) surfaces when an update is **available** or **pending**. It pads with `useSafeAreaInsets().top` so Restart / dismiss never sit under the status bar (crisis 2026-07-23). Targets are ≥44pt. Dismiss persists across launches for that update fingerprint; **Download & restart** / **Restart** applies immediately.
4. **Alert prompt** — after onboarding (when not freeze-suppressed), the same hook fires a one-time `Alert.alert('Update available', …)` per app session when state first becomes available or pending (in addition to the banner).
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

<!-- 2026-07-22: production-android-paid channel must be published with production OTA for paid Play SKU. -->
