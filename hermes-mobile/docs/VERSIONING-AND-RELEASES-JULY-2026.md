# Hermes Mobile — Versioning & Releases (July 2026) — LAW

**Status:** binding release law (updated 2026-07-15 after Play **1.0 / vc14** NSC)  
**Companion:** [VERSIONING-AND-RELEASES.md](./VERSIONING-AND-RELEASES.md) · [OTA_UPDATES.md](./OTA_UPDATES.md)  
**Expo:** [runtime versions](https://docs.expo.dev/eas-update/runtime-versions/) · [rollouts](https://docs.expo.dev/eas-update/rollouts/) · [code signing](https://docs.expo.dev/eas-update/code-signing/)

This file is **law**. Agents must **not** claim “all Play users updated” or “OTA fixed Tailscale/NSC.” OTA never delivers native Network Security Config.

---

## Live facts (re-verified 2026-07-15)

| Surface | Marketing / versionName | Native | Embedded OTA runtime | Notes |
|---------|-------------------------|--------|----------------------|-------|
| **Google Play production** | **1.0** | versionCode **14** (NSC cleartext + `ts.net`) | **1.0** | Track API completed for vc14; **do not** claim every install has vc14 until that device reports it |
| **Prior Play binary** | **1.0** | versionCode **13** | **1.0** | NSC base cleartext was **false** — Tailscale Find computers broken until users get vc14 |
| **iOS public** | **1.0** | store train | **1.0** | JS/asset OTA OK; native still needs a new binary |
| Repo `app.json` | Keep **1.0** while Play NSC train is live | remote `versionCode` | `appVersion` → **1.0** | Do not bump to **1.1** on `main` until a deliberate dual-store runtime plan (see PR #451 pin) |

**Decision (execute, do not debate):**

1. **Native / plugin / permission / NSC / SDK / `expo.version` bump** → new store binary. OTA cannot repair NSC or Tailscale cleartext.
2. **JS / assets** → OTA only for installs whose binary embeds matching `runtimeVersion` (**1.0** today).
3. **Production OTA CI:** not automatic on every `main` push. Preview may publish on push; **production** requires `workflow_dispatch` + `publish_production=true` + fresh-user / continuous **`e2e=pass`** proof.
4. **Staged rollout:** production publish uses `--rollout-percentage` (default **10%**). Promote with `promote_production_rollout` (or `eas update:edit`) — never blast 100% without a health look.
5. **Code signing:** optional until `EXPO_UPDATE_PRIVATE_KEY` + native cert config land; CI must log skip honestly.

---

## Three version planes (never conflate)

| Plane | Field | Truth source | OTA effect |
|-------|--------|--------------|------------|
| Marketing | `expo.version` → Play `versionName` / iOS CFBundleShortVersionString | `app.json` | Under `appVersion` policy this **is** `runtimeVersion` |
| Build number | Android `versionCode` / iOS CFBundleVersion | EAS **remote** + `autoIncrement` | Not OTA |
| OTA group | EAS channel update | `mobile-ota.yml` / `eas update` | JS+assets for matching runtime only |

---

## OTA vs store binary (decision tree)

```text
Change type?
  JS / TS / UI / assets / EXPO_PUBLIC_* at publish time
    → OTA on matching runtime (1.0), production gated + staged
  Native module, config plugin, NSC, permission, Expo SDK, expo.version bump
    → EAS production build + store submit (new binary)
  Listing / IAP metadata only
    → Console/API (no OTA, no binary)
```

**Honesty rule:** `e2e=skipped` / `e2e≠pass` ⇒ do **not** claim device UX verified. Play track **completed** ≠ every device updated.

---

## CI contract (`mobile-ota.yml`)

| Rule | Implementation |
|------|----------------|
| Preview on push | `publish-preview-ota` only |
| Production | `workflow_dispatch` + `publish_production=true` + Fresh-user OTA gate |
| Staged production rollout | `--rollout-percentage` (default 10); promote via `promote_production_rollout` |
| Code signing | If `secrets.EXPO_UPDATE_PRIVATE_KEY` → `--private-key-path`; else log skip |
| Quality gate | privacy scan, release:check, typecheck, test:ci, release-safety, export scan |

```bash
# Promote after health looks good (workflow_dispatch):
#   promote_production_rollout=100
# or locally:
eas update:edit --group <groupId> --rollout-percentage 100 --non-interactive
```

---

## Anti-goals

- Claiming “all users updated” because Play API shows vc14 completed
- Claiming OTA fixed Tailscale / NSC / cleartext
- Auto-publishing production on every `main` merge
- 100% blast production OTA with no rollout knob
- Bumping `expo.version` to 1.1 while Play users still need runtime **1.0** NSC binaries
- Treating local `android.versionCode` in `app.json` as Play truth under `appVersionSource: remote`
