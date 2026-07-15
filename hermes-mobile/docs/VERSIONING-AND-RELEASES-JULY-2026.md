# Hermes Mobile — Versioning & Releases (July 2026)

**Canonical contract** for store-facing versions, EAS Build numbers, and EAS Update (OTA).  
**App:** `com.iganapolsky.hermesmobile` · ASC id `6786778037` · Expo project `4ed13e30-9b97-4ddd-8a12-59106cae90d6`

> **Honesty:** Prior “stellar / iOS 1.1 / build 16” claims without this doc were **not** grounded in deep research. This file was written after Parallel deep research (`trun_ea8a69880d1941f58ea87e61d285b192`, 2026-07-15) **plus** primary Expo/Apple/Google docs. The research model briefly confused our product with NousResearch `hermes-agent` — **ignore that**; store truth below is from *this* repo + ASC/Play.

---

## 1. Two version planes (never conflate)

| Plane | What users / stores see | What CI / EAS increments | Hermes fields |
|-------|-------------------------|--------------------------|---------------|
| **Marketing version** | App Store / Play listing version | **Manual** bump in `app.json` → `expo.version` | Maps to iOS `CFBundleShortVersionString`, Android `versionName` |
| **Build number** | Hidden (TestFlight / Play console only) | **Remote** auto-increment on production EAS builds | iOS `CFBundleVersion` ← `ios.buildNumber`; Android `versionCode` |

Official mapping: [Expo — App version management](https://docs.expo.dev/build-reference/app-versions/).  
Apple marketing format (prefer three integers): [CFBundleShortVersionString](https://developer.apple.com/documentation/bundleresources/information-property-list/cfbundleshortversionstring).  
Google: `versionName` (string) + monotonic integer `versionCode` ([version your app](https://developer.android.com/studio/publish/versioning)).

### SemVer for marketing (`MAJOR.MINOR.PATCH`)

| Bump | When |
|------|------|
| **MAJOR** | Breaking product contract for end users (rare) |
| **MINOR** | User-visible feature / store metadata train (e.g. live **1.0** → **1.1** for subtitle/keywords) |
| **PATCH** | Store-facing hotfix that needs a new listing version (unusual; prefer OTA if JS-only) |

**Rules:**

1. Prefer **three components** (`1.1.0`) for new ASC versions. Live **1.0** (two-part) was already accepted by Apple — do not rewrite history; next cutover may be `1.1` or `1.1.0` — pick one string and keep ASC, Play `versionName`, and `app.json` `version` identical.
2. `package.json` `"version"` (`0.1.0` today) is **npm/repo SemVer only**. It is **not** the store marketing version. Do not sync them.
3. Build numbers are **not** SemVer. They are strictly **monotonic integers** (iOS stringified decimal; Android `versionCode`).

### Is “1.1 with build 16 while live 1.0” correct?

**Yes — that is the normal store train, not an anti-pattern.**

- ASC keeps **1.0** `READY_FOR_SALE` until **1.1** is approved and released.
- New binaries attach to the **1.1** version record; each upload needs a **higher** `CFBundleVersion` than any prior upload for that app.
- Live users stay on **1.0** (+ OTA for `runtimeVersion` `1.0`) until they update the binary or you release 1.1.
- Trademark / subtitle / keyword fixes that require a **new App Store version** belong on the **1.1** train; they do **not** change the meaning of build 16 vs marketing 1.1.

“Stellar” in July 2026 is **conversion + correct version trains**, not inventing a third versioning scheme.

---

## 2. EAS Build versioning (July 2026)

**Policy (already in `eas.json` — keep):**

```json
{
  "cli": { "appVersionSource": "remote" },
  "build": {
    "production": { "autoIncrement": true, "channel": "production" }
  }
}
```

- **`remote`** is Expo’s recommended source of truth for developer-facing builds since EAS CLI ≥ 12 ([docs](https://docs.expo.dev/build-reference/app-versions/)). Local `ios.buildNumber` / `android.versionCode` in `app.json` are **fallbacks / documentation floors**, not CI truth.
- **`autoIncrement: true`** only increments **build numbers**, never marketing `version` ([same docs — limitation](https://docs.expo.dev/build-reference/app-versions/)).

### `eas build:version:set` pitfalls

| Do | Don’t |
|----|--------|
| Use `eas build:version:set` to **initialize/sync remote build counters** to the last store-accepted `versionCode` / `buildNumber` | Treat it as a marketing-version bump |
| After store drift, set remote to **last live Play/ASC build**, then let `autoIncrement` continue | Pass marketing SemVer into build-number slots |
| Prefer `eas build:version:get` before every paid production build | Manually edit `app.json` build fields hoping CI will persist them under `remote` |

**Known footgun:** agents historically ran `eas build:version:set --app-version …` expecting to change **marketing** version; under remote mode the CLI manages **build** counters. **Marketing bumps = edit `app.json` `expo.version` only**, then new native builds + ASC/Play version records.

---

## 3. EAS Update / Expo Updates (July 2026)

Primary refs: [How EAS Update works](https://docs.expo.dev/eas-update/how-it-works/), [Runtime versions](https://docs.expo.dev/eas-update/runtime-versions/), [Channels & branches](https://docs.expo.dev/eas-update/eas-cli/).

### Channel ↔ build profile

| Channel | Build profile | Who gets it |
|---------|---------------|-------------|
| `production` | `build.production` | Play / App Store / release phone installs |
| `preview` | `build.preview` | Internal preview APK / sim |
| `e2e-test` | `build.e2e-test` | Maestro automation only |

Channels are **baked at build time**. Default: channel links to a branch of the **same name**. Publish with `eas update --channel <name>` (CI does preview + production).

### `runtimeVersion` policy: `appVersion` (Hermes choice)

```json
"runtimeVersion": { "policy": "appVersion" }
```

- Runtime string = marketing `expo.version` (today **`1.0`**).
- OTA bundles apply **only** to native binaries with the **exact** same runtime.
- Bumping `expo.version` (e.g. to `1.1`) **starts a new OTA line** — devices on 1.0 binaries keep receiving `runtimeVersion=1.0` updates until they install a 1.1 binary.

**Why not `fingerprint` (research default for high-native-churn apps)?**  
Fingerprint minimizes incompatible OTAs but forces more native rebuilds on plugin/Gradle noise. Hermes Mobile pins native changes to deliberate store trains and already enforces `appVersion` in `verify-release-readiness.cjs` + release-safety tests. **Stay on `appVersion` unless we adopt fingerprint in a dedicated native rebuild PR.**

**Do not use `nativeVersion` policy** with remote build numbers — Expo documents this incompatibility; use `appVersion` instead ([app versions limitations](https://docs.expo.dev/build-reference/app-versions/)).

### OTA vs store binary

| Change | Ship via |
|--------|----------|
| JS/TS screens, hooks, copy, assets in JS bundle | **OTA** (`mobile-ota.yml` / `npm run ota:publish`) |
| `EXPO_PUBLIC_*` values | **OTA** (baked at publish time) |
| New native module / `expo install` with native code | **Store binary** (EAS Build + submit) |
| `app.json` plugins, permissions, ProGuard, SDK bump | **Store binary** |
| Marketing version / ASC localization (subtitle, keywords) | **Store version train** (ASC 1.1 etc.) — not OTA |
| `runtimeVersion` / `expo.version` bump | **Store binary** first, then OTA on the new runtime |

### Rollback / critical updates

| Situation | Action |
|-----------|--------|
| Bad JS OTA on a channel | `eas update:republish --branch <branch>` (or group id) — republish last good update ([EAS CLI](https://docs.expo.dev/eas-update/eas-cli/)) |
| Need gradual exposure | EAS Update **rollouts** (percent) — monitor error rate, cancel if needed ([runtime versions — rollouts](https://docs.expo.dev/eas-update/runtime-versions/)) |
| Native crash / wrong binary | New store build; OTA cannot fix native |
| “Force everyone onto fix now” | OTA is **best-effort** (ON_LOAD). For hard force, ship binary + optional in-app minimum-build gate (product decision) |

### Hard gate — no production OTA without stranger proof

Already on `main` in `.github/workflows/mobile-ota.yml`:

1. Quality gate runs `node ./scripts/require-stranger-cold-start-proof.cjs --hard`
2. Unit + `test:release-safety` + privacy export scan
3. Only then `eas update --channel` preview + production

**Never** claim “shipped to users via OTA” if continuous E2E `docs/proofs/continuous/latest.json` has `e2e != pass` for device UX claims (local LaunchAgent). CI merge-block stranger cold-start is the store/OTA publish gate.

---

## 4. 1.1 cutover checklist (when ASC approves 1.1)

| Step | What happens |
|------|----------------|
| 1 | ASC **1.1** goes `READY_FOR_SALE`; public lookup version becomes **1.1**; **1.0** listing fields (subtitle/keywords) are **replaced** by 1.1 localization — not merged side-by-side |
| 2 | Set `app.json` `expo.version` → **`1.1`** (or **`1.1.0`** — match ASC exactly) **before** the production native build that ships 1.1 |
| 3 | EAS production build (`autoIncrement`) produces next monotonic iOS `buildNumber` / Android `versionCode`; submit to ASC 1.1 + Play with matching `versionName` |
| 4 | OTA: publishes targeting `runtimeVersion=1.1` apply only to **1.1 binaries**. Keep publishing `runtimeVersion=1.0` OTAs only while 1.0 binaries remain supported (or stop when you EOL 1.0) |
| 5 | Play: align `versionName` to marketing string; never reuse a `versionCode` |
| 6 | Phased release: optional Play staged rollout / ASC phased release for binary risk; listing metadata goes live with the version |

Until cutover: live users = **1.0** + OTA on runtime **1.0**. Draft **1.1** metadata in ASC is **not** live.

---

## 5. Current repo audit (2026-07-15)

| Item | Practice | Verdict |
|------|----------|---------|
| `eas.json` `appVersionSource: remote` + production `autoIncrement` | Matches Expo 2026 recommendation | **Correct** |
| `runtimeVersion.policy: appVersion` | Matches OTA safety + release-safety contract | **Correct** (intentional vs fingerprint) |
| Build channels on profiles | `production` / `preview` / `e2e-test` | **Correct** |
| `mobile-ota.yml` stranger hard gate | Present | **Correct** |
| `app.json` `version: "1.0"` | Matches live ASC marketing | **OK** until 1.1 cutover |
| Local `buildNumber: "13"` / `versionCode: 11` | Floors only under remote | **OK** if remote ≥ store; sync with `eas build:version:get` before paid builds |
| `package.json` `0.1.0` | Independent of store | **Correct** |
| `docs/OTA_UPDATES.md` claimed `appVersionSource: local` + version `0.3.2` | Stale | **Fixed** in same PR |

**Config gap requiring eas.json change:** none for this policy. Doc drift was the primary gap.

---

## 6. Agent operating rules

1. Marketing bump → `app.json` `expo.version` + new ASC/Play version + new native builds.  
2. Build bump → let EAS remote `autoIncrement` do it; verify with `eas build:version:get`.  
3. JS fix on current train → OTA only after stranger hard gate.  
4. Native / plugin / SDK / permissions → store binary.  
5. Never claim stellar store versioning without this contract + live ASC/Play evidence.

---

## Citations

- Expo app versions (remote/local, autoIncrement): https://docs.expo.dev/build-reference/app-versions/  
- EAS Update concepts: https://docs.expo.dev/eas-update/how-it-works/  
- Runtime versions / rollouts: https://docs.expo.dev/eas-update/runtime-versions/  
- Channels, branches, republish: https://docs.expo.dev/eas-update/eas-cli/  
- Apple CFBundleShortVersionString: https://developer.apple.com/documentation/bundleresources/information-property-list/cfbundleshortversionstring  
- Android versioning: https://developer.android.com/studio/publish/versioning  
- Parallel research artifact (Expo section useful; Hermes Agent product confusion discarded): `parallel-research/expo-updates-versioning-july-2026.md` · interaction `trun_ea8a69880d1941f58ea87e61d285b192`
