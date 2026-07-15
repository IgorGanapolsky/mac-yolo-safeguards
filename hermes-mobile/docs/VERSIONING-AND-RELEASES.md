# Hermes Mobile — versioning, OTA, and store releases

**Status:** canonical process (2026-07-15)  
**Related:** [OTA_UPDATES.md](./OTA_UPDATES.md), [PLAY_RELEASE.md](./PLAY_RELEASE.md), EAS `eas.json`, `app.json`

This is how we ship. It is **not** “pure semver for every commit.” It is a **three-layer** model that matches Expo EAS Update + App Store / Play.

---

## 1. Three version layers

| Layer | Where | Format | Who bumps | Purpose |
|-------|--------|--------|-----------|---------|
| **Marketing version** | `expo.version` in `app.json` (and store listings) | `MAJOR.MINOR` or `MAJOR.MINOR.PATCH` | Human, deliberate | User-facing; **OTA `runtimeVersion`** when policy is `appVersion` |
| **Native build number** | iOS `CFBundleVersion` / Android `versionCode` | Monotonic integer | EAS **remote** + `autoIncrement` on production | Store uniqueness; must always increase |
| **OTA update group** | EAS channel (`production`, `preview`, …) | SHA + message | CI on `main` / `eas update` | JS + assets only, for matching runtime |

### Current live facts (re-verify before claims)

| Surface | Marketing | Native | OTA runtime |
|---------|-----------|--------|-------------|
| Production OTA channel | — | — | Active groups for **`1.0`** |
| App Store **1.0** | 1.0 | build **14** | users get OTA for **1.0** |
| App Store **1.1** | 1.1 | build **16** | **WAITING_FOR_REVIEW** until released; then need OTA for runtime **1.1** |
| Play production | store listing version | versionCode (remote auto) | OTA if binary embeds matching `expo.version` |

Commands: `npx eas-cli channel:list`, ASC / Play APIs.

---

## 2. Semantic versioning (policy)

We use **semver for the marketing version only**, not for every OTA.

| Bump | When | Also do |
|------|------|---------|
| **PATCH** `1.0.x` | Rare; prefer OTA without bump | New native build **if** marketing string changes under `appVersion` policy |
| **MINOR** `1.0` → `1.1` | New capability, store metadata needing a new ASC version, or intentional OTA line cut | EAS production build + store submit; first OTA for new runtime after installs |
| **MAJOR** `1.x` → `2.0` | Breaking UX / pairing / paid tier reset | Same as minor + migration notes |

**Default for bug fixes:** do **not** bump marketing version — merge to `main` → OTA.

**Never:**
- Bump `expo.version` without shipping native binaries that embed that version.
- Decrease iOS build number / Android versionCode.
- Publish OTA only to `preview` and assume store users get it.

---

## 3. OTA vs store binary

```text
JS/TS/UI/assets only?
  YES → main → mobile-ota.yml → eas update (production then preview)
  NO  → native / plugins / SDK / permissions / expo.version bump?
          YES → EAS production build + store submit
          listing/IAP metadata only → Console/API (no OTA, no binary)
```

| OTA-safe | Requires new native store build |
|----------|----------------------------------|
| Chat UI, copy, state machines | New native dependency / config plugin |
| Gateway client logic | Permission / Info.plist / AndroidManifest |
| Most product bugs | Expo SDK upgrade |
| Images/fonts in JS bundle | `runtimeVersion` / `expo.version` bump |

---

## 4. Runtime policy: `appVersion`

```json
"runtimeVersion": { "policy": "appVersion" }
```

- OTA applies only when **published runtime == native embedded `expo.version`**.
- Chosen over **fingerprint** for simpler CI (less false split noise).
- Cost: marketing version bumps **split** the OTA line until store binary + OTA exist for the new version.

**EAS:** `cli.appVersionSource: "remote"` + production `autoIncrement: true`  
→ **build numbers** on EAS remote; do not treat stale local `buildNumber` / `versionCode` as truth.

---

## 5. Release playbooks

### A. Everyday JS fix (preferred)

1. PR → merge `main` (`hermes-mobile/**`)
2. CI OTA: quality gate → `eas update` production then preview
3. User cold start / next launch
4. No store review

### B. Store binary (native or version bump)

1. Semver decision (table §2)
2. EAS remote build number **>** last store build
3. `eas build --profile production`
4. Submit Play / ASC
5. After live: ensure OTA groups exist for that **runtime**

### C. Cutover when **1.1** ships

1. Release ASC/Play **1.1** binaries  
2. `app.json` `version` is **1.1** on `main`  
3. Publish production OTA for runtime **1.1**  
4. Keep **1.0** OTA groups while old installs remain  
5. Do not abandon 1.0 OTAs until base has moved  

---

## 6. Channels

| Channel | Profile | Audience |
|---------|---------|----------|
| `production` | `production` | Store customers |
| `preview` | `preview` | Sideload / internal |
| `e2e-test` | `e2e-test` | Maestro (updates often off) |

CI publishes **production first**, then preview (`mobile-ota.yml`).

---

## 7. Commands

```bash
cd hermes-mobile
npm run ota:validate
npm run ota:publish
npx eas-cli channel:list
npx eas-cli update:list --branch production --limit 5
```

---

## 8. Anti-goals

- “Every fix needs the store” — **false** (JS uses OTA).  
- “Semver is fully automated” — **false**.  
- Ship 1.1 without OTA for runtime **1.1**.  
- Trust stale `app.json` build fields over EAS/store APIs.

---

## 9. Verify before “it ships via OTA”

- [ ] JS-only change  
- [ ] `expo.version` matches installed production runtime you care about  
- [ ] `mobile-ota` green or manual publish ok  
- [ ] `channel:list` shows new group for that runtime on `production`  
- [ ] Device relaunched after publish

## 10. Post-approval automation

```bash
# Poll ASC; release if PENDING_DEVELOPER_RELEASE (or report READY_FOR_SALE)
node scripts/release-asc-version-when-ready.js --version 1.1 --poll-minutes 180

# After 1.1 is live on devices, ensure main has expo.version 1.1 then:
npm run ota:publish   # creates OTA groups for current appVersion runtime
```

