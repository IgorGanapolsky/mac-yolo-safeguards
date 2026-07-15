# Hermes Mobile — EAS OTA updates

Hermes Mobile ships JS and asset fixes over the air (EAS Update) so Igor's phone and production users receive fixes merged to `main` without reinstalling the APK for every change.

## Channel strategy

| Channel | Build profile | OTA publish | Audience |
|---------|---------------|-------------|----------|
| `production` | `eas.json` → `build.production` | `main` push (CI) or `npm run ota:publish` | Store / Igor phone release APK |
| `preview` | `build.preview` | `npm run ota:preview` | Internal EAS preview APK |
| `e2e-test` | `build.e2e-test` | `npm run ota:e2e` | Maestro / automation builds |

**Production channel** receives automatic OTA publishes from `.github/workflows/mobile-ota.yml` on every push to `main` that touches `hermes-mobile/**`.

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

## In-app UI (honest path)

| Path | What you see |
|------|----------------|
| **Settings → App updates** (near top) | Primary control. Shows channel, runtime, update id, and **Check for update**. |
| Chat → Tools → Connection health | Secondary duplicate of the same check (easy to miss — do not tell users this is the main path). |
| Settings → Computer gateway ops | Same Connection health card buried under machines / URL / API key. |

**Prior agents wrongly said “Settings → Tools → Check for update.”** There is no Settings → Tools menu. Tools is a **Chat header** modal for gateway toolsets.

### What “No newer update…” means

`Updates.checkForUpdateAsync()` returned `isAvailable: false` for this **channel + runtime**. It does **not** mean:

- you opened a buried menu, or
- the store APK binary is the newest Play build, or
- every JS fix ever published is visible without a restart.

It means Expo has nothing newer to download right now. The card also shows the running `updateId` so you can compare to `eas update:list --branch production`.

### Auto vs manual

1. **Launch check** — `updates.checkAutomatically: ON_LOAD` (disabled for E2E automation builds).
2. On cold start, `expo-updates` checks `https://u.expo.dev/4ed13e30-9b97-4ddd-8a12-59106cae90d6` on the `production` channel.
3. If a newer compatible bundle exists, the app downloads it and applies it on the **next** full restart (default Expo behavior). There is **no** blocking “Update available” modal today.
4. **Manual** — Settings → App updates → Check for update runs check + fetch + `reloadAsync` when a newer bundle exists.

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
