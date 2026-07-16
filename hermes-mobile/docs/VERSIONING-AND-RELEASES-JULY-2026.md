# Hermes Mobile — Versioning & Releases (July 2026) — LAW

**Status:** binding crisis decision (2026-07-15)  
**Companion:** [VERSIONING-AND-RELEASES.md](./VERSIONING-AND-RELEASES.md) (process detail) · [OTA_UPDATES.md](./OTA_UPDATES.md)  
**Expo primary docs:** [runtime versions](https://docs.expo.dev/eas-update/runtime-versions/) · [rollouts](https://docs.expo.dev/eas-update/rollouts/) · [code signing](https://docs.expo.dev/eas-update/code-signing/)

This file is **law**. Agents must not claim Play users are “fixed via OTA” while the public Android binary is still on marketing/runtime **0.3.2**.

---

## Crisis facts (re-verified 2026-07-15)

| Surface | Marketing / versionName | Native | Embedded OTA runtime | Can receive `runtimeVersion=1.0` OTA? |
|---------|-------------------------|--------|----------------------|--------------------------------------|
| **Google Play production track (API 2026-07-15)** | **1.0** (release completed, vc **13**) | versionCode **13** | EAS build `c1e3f4c2` Runtime **1.0** | **YES after users update binary** — public Play HTML may still show 0.3.2 until CDN/devices catch up |
| **iOS public** (iTunes GB) | **1.0** (released 2026-07-14) | store build train | **1.0** | **YES** (JS/assets only) |
| **EAS `production` channel** | — | — | Active update groups for **1.0** | Only installs whose binary embeds **1.0** |
| Repo `app.json` | **1.0** | remote `versionCode` (floor local 11) | policy `appVersion` → **1.0** | N/A until store binary ships |

**Decision (execute, do not debate):**

1. **Android needs a NEW Play Store binary** with marketing + runtime **1.0**. Until that binary reaches the Play **production** track, runtime **1.0** OTAs **cannot** repair public **0.3.2** installs.
2. **iOS:** public runtime is **1.0** → JS/asset OTA is OK. Native/plugin/permission/SDK changes still need a new store binary (and a new marketing version if `appVersion` policy requires a new runtime line).
3. **Native / plugin / permission / SDK** → always new binary. **JS / assets** → OTA only after runtime match.
4. **Hardening (mandatory in CI):**
   - Publish channel order must be **production then preview** (never the reverse).
   - Production OTA uses **staged rollout** (`--rollout-percentage`, default **10%**; promote via `eas update:edit` / workflow input).
   - **Code signing** for updates is required for full hardening; wire `EXPO_UPDATE_PRIVATE_KEY` (PEM) + certificate in app config per Expo docs. Until that secret exists, CI may publish unsigned and must log the skip honestly — do not claim signed OTAs.

---

## Three version planes (never conflate)

| Plane | Field | Truth source | OTA effect |
|-------|--------|--------------|------------|
| Marketing | `expo.version` → Play `versionName` / iOS `CFBundleShortVersionString` | `app.json` (manual) | Under `appVersion` policy this **is** `runtimeVersion` |
| Build number | Android `versionCode` / iOS `CFBundleVersion` | EAS **remote** + `autoIncrement` | Not OTA |
| OTA group | EAS channel update | `mobile-ota.yml` / `eas update` | JS+assets for matching runtime only |

Refs: [Expo app versions](https://docs.expo.dev/build-reference/app-versions/), [EAS Update runtime versions](https://docs.expo.dev/eas-update/runtime-versions/).

---

## OTA vs store binary (decision tree)

```text
Change type?
  JS / TS / UI / assets / EXPO_PUBLIC_* at publish time
    → OTA on matching runtime (iOS 1.0 OK today; Play only after 1.0 binary live)
  Native module, config plugin, permission, Info.plist/Manifest, Expo SDK, expo.version bump
    → EAS production build + store submit (new binary)
  Listing / IAP metadata only
    → Console/API (no OTA, no binary)
```

**Honesty rule:** `e2e=skipped` or Play still on **0.3.2** ⇒ do **not** claim public Android users are fixed.

---

## CI contract (`mobile-ota.yml`)

| Rule | Implementation |
|------|----------------|
| Production publish | `workflow_dispatch` + `publish_production` + fresh-user `e2e=pass` gate; staged `--rollout-percentage` (default 10%); optional `EXPO_UPDATE_PRIVATE_KEY` |
| Staged production rollout | `eas update --rollout-percentage` (default 10); promote via workflow_dispatch `promote_production_rollout` |
| Preview | Full 100% (internal / sideload) |
| Code signing | If `secrets.EXPO_UPDATE_PRIVATE_KEY` present → `--private-key-path`; else log skip |
| Quality gate | privacy scan, release:check, typecheck, test:ci, release-safety, export scan |

Promote example (after health looks good):

```bash
# workflow_dispatch: promote_production_rollout=100
# or locally:
eas update:edit <groupId> --rollout-percentage 100 --non-interactive
```

---

## Code signing (Expo)

1. Generate: `npx expo-updates codesigning:generate` → `private-key.pem`, `certificate.pem`
2. Configure app: `npx expo-updates codesigning:configure` (embeds cert + metadata; **requires new native binary**)
3. Store private key in GitHub secret **`EXPO_UPDATE_PRIVATE_KEY`** (PEM body); never commit the private key
4. CI already passes `--private-key-path` when the secret exists

Until (2)+(3) land, updates remain **unsigned**. That is an explicit gap, not a silent pass.

---

## Play 1.0 cutover checklist

- [x] EAS Android production AAB with `Version` / `Runtime Version` **1.0** and `versionCode` **> 12** (build `c1e3f4c2`, vc13)
- [x] `eas submit` via Store Release [29436805345](https://github.com/IgorGanapolsky/mac-yolo-safeguards/actions/runs/29436805345) — track API `name=1.0` / `versionCodes=[13]` / `status=completed`
- [x] Play **API** production track shows **1.0** / vc13
- [ ] Public Play HTML still listed **0.3.2** at submit time (CDN lag) — re-check before claiming all users updated
- [ ] Only then claim Android users can receive runtime **1.0** OTA
- [ ] Keep publishing OTA groups for runtime **1.0**; do not bump `expo.version` to 1.1 on `main` until both stores have a plan for the new runtime line

---

## Anti-goals

- Claiming “OTA fixed Play” while production track is **0.3.2**
- Publishing preview before production in CI
- 100% blast production OTA with no rollout knob
- Bumping `expo.version` without shipping matching store binaries
- Treating local `android.versionCode` in `app.json` as Play truth under `appVersionSource: remote`
