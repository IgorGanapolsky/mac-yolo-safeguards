# Research ingest — Expo EAS Update / versioning (July 2026)

**run_id / interaction_id:** `trun_f2a579aeec4a47d794e39ae991acf229`  
**processor:** `pro-fast`  
**completed:** 2026-07-15  
**raw:** [`parallel-research/expo-ota-versioning-july-2026.md`](../../parallel-research/expo-ota-versioning-july-2026.md)

---

## Verdict

Hermes Mobile’s **current design matches the 2026 conservative default**:

| Practice | Research | Hermes today |
|----------|----------|--------------|
| `runtimeVersion: appVersion` | Conservative default | **Yes** |
| JS via OTA, native via store | Standard split | **Yes** |
| `appVersionSource: remote` + `autoIncrement` | Recommended for store numbers | **Yes** |
| Production + preview/staging channels | Required | **Yes** (`production`, `preview`, `e2e-test`) |
| CI `eas update` on main | Standard | **Yes** (`mobile-ota.yml`) |
| Staged rollout % | Best practice | **Not yet** (full channel) |
| Code signing for updates | Best practice | **Not yet** (`N/A` on recent groups) |
| `fingerprint` runtime | Higher safety, more builds | **Not adopted** (deliberate) |
| Semver for marketing only | Correct framing | **Documented now** in VERSIONING-AND-RELEASES |

**Gap vs “best”:** staged rollouts + update code signing.  
**Not a gap:** using OTA for bug fixes without store versions.

---

## Multi-runtime (1.0 + 1.1)

Research: channels can serve **multiple runtime versions** (separate update groups). After 1.1 store ships:

1. Keep publishing OTA for runtime **1.0** while holdouts remain  
2. Publish OTA for runtime **1.1** as soon as `expo.version` is 1.1 on `main` and users can install 1.1  
3. Optional later: fingerprint migration when native churn rises  

---

## Action checklist (Hermes-specific)

1. **Done this PR:** [VERSIONING-AND-RELEASES.md](./VERSIONING-AND-RELEASES.md) + OTA doc fix + contract tests + AGENTS pointer  
2. **When ASC 1.1 approved:** release → set/confirm `app.json` version `1.1` on main → ensure production OTA for runtime **1.1**  
3. **P1 upgrade path:** `eas update --rollout-percentage=10` for risky OTA  
4. **P2:** configure `expo-updates` code signing in CI  
5. **Later:** consider `fingerprint` if native deps churn  

---

## Follow-up

```bash
parallel-cli research run "…" --previous-interaction-id trun_f2a579aeec4a47d794e39ae991acf229 --processor lite-fast --text --no-wait --json
```
