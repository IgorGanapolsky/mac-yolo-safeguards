# Hermes Mobile — Real-user readiness (external beta)

**Last audited:** 2026-07-09  
**Audience:** External testers (not Igor dev backdoor)  
**Evidence:** `npm run test:ci`, continuous E2E `latest.json`, Play public listing (Teen, Jul 9), Play API subscription `thumbgate_leash_monthly` ACTIVE.

---

## Executive summary

| Area | Status | Notes |
|------|--------|-------|
| **Install without USB/adb** | **Partial (Android)** | Play Production **public** since Jul 9, 2026 — Teen rating, 0+ downloads, `com.iganapolsky.hermesmobile` returns HTTP 200. **iOS not public** (ASC still in review / not searchable). Firebase internal-distribution CI may still need green re-run. |
| **Onboarding without adb** | **Partial** | Relay pair code + `hermes://relay?code=` deep link + QR scan work in-app. Stranger still needs Hermes Relay running on a Mac and a code/QR from that machine — no fully hosted “sign up” flow. |
| **ThumbGate for subscribers** | **Partial** | Leash Pro IAP wired (`thumbgate_leash_monthly` via `expo-iap`). Play API confirms subscription **ACTIVE** (base plan `monthly`, $19.99/mo). Chat output thumbs → `POST /v1/feedback/capture` when Leash unlocked. Requires Pro purchase or dev backdoor — **not** free for all users. |
| **Connection (cellular + tunnel)** | **Partial** | Cellular tunnel wizard shipped in Settings (`settings-cellular-tunnel-banner`). Cloud relay preferred off Wi‑Fi. User must configure tunnel URL on Mac — not one-tap for strangers. |
| **Honest disconnected UX** | **Ready** | Run progress banner shows connectivity failures; gateway bootstrap gates chat when unreachable. |
| **Dev-only UX in production builds** | **Mostly OK** | `EXPO_PUBLIC_HERMES_DEV_UNLOCK` only in dev/preview/e2e EAS profiles, not production. `developerLeashUnlock` deep link remains Igor-only escape hatch — not required if user buys Pro. |
| **Automated quality** | **Ready (local)** | 594 unit tests pass; continuous E2E pass on device/simulator. GitHub `internal-distribution.yml` failed typecheck on last main merge — fix before relying on CI APK. |

**Verdict:** **Android install path open** (Play public, Teen). **iOS still blocked.** Stranger onboarding (Mac + relay + optional tunnel) not yet validated end-to-end without adb. IARC/ratings questionnaire email is **compliance housekeeping**, not a revenue gate — Play listing and IAP are already live.

---

## 1. Distribution

### What works today

- **Local USB release:** `npm run android:phone` / `scripts/install-phone-release.sh` — Igor-only, requires adb.
- **EAS profiles:** `production` builds AAB without dev unlock; `preview` builds arm64-only APK for Firebase (~43 MB — see [SIZE.md](./SIZE.md)).
- **GitHub workflows:** `internal-distribution.yml` (Firebase), `store-release.yml` (Play/App Store submit).

### Blockers for real users

1. **Google Play Production** — **published Jul 9, 2026** (Teen, US). Public listing live; IARC follow-up email is ratings compliance, not revenue-blocking.
2. **Firebase CI** — last main push run **failed** at TypeScript check (`gatewayFixtures.ts` duplicate key — fixed in this branch). Re-run after merge:
   ```bash
   gh workflow run internal-distribution.yml -f target=android_firebase
   ```
3. **Tester email gate** — Firebase requires `iganapolsky@gmail.com` on tester list; strangers need either Play open testing or expanded Firebase group.

### Ready when

- [ ] Green Firebase or Play **internal/open testing** build strangers can install from email/link
- [ ] Production AAB built without `EXPO_PUBLIC_HERMES_DEV_UNLOCK`
- [ ] PostHog `app_open` from a non-dev build

---

## 2. Onboarding (no adb)

### Shipped paths

| Method | UI entry | Requires |
|--------|----------|----------|
| **Relay pair code** | Settings → Hermes Relay → enter code | Mac running Hermes Relay; code from desktop Hermes |
| **Relay deep link** | `hermes://relay?code=XXXX` | Same; user taps link (SMS/email/web) |
| **Local QR** | Connect Mac gate → Scan QR | Same Wi‑Fi or pair page URL; Mac Hermes gateway |
| **LAN discovery** | Settings → Find Macs | Same Wi‑Fi; mDNS/Bonjour |

### Blockers

- No cloud account signup — pairing assumes user already operates Hermes on a Mac.
- QR/pair page must be served by user's Mac (`/pair.json` or gateway URL).
- Stranger on cellular with LAN-only saved profile sees tunnel wizard — must paste tunnel URL manually.

### Ready when

- [ ] Written “day 1” guide: install APK → Settings → paste relay code → send test message
- [ ] Relay worker hosted 24/7 (not only Igor's MacBook)
- [ ] Optional: public pair landing page (out of scope today)

---

## 3. ThumbGate for subscribers

### Shipped

- **Leash approvals** → `captureLeashThumbgate` → `thumbgateClient.captureThumbgateFeedback`
- **Chat output thumbs** (assistant bubbles, completed, non-streaming) → `submitChatOutputFeedback` → same HTTP API
- **Settings:** `thumbgateCaptureOnDown` (default on), `thumbgateCaptureOnUp` (default off), API URL + key
- **Gating:** `isThumbgateLeashUnlocked` = Pro IAP **or** `developerLeashUnlock` (dev only)

### Blockers

- **`thumbgate_leash_monthly`** — Play API: **ACTIVE** (`monthly` base plan). ASC still needs metadata/price tier. Sandbox purchase QA on physical device still open.
- ThumbGate API URL/key not pre-provisioned for strangers — user or operator must configure.
- Thumbs hidden until Leash unlocked — correct for product, but free-tier users see no feedback UI.

### Ready when

- [ ] Play subscription live and `syncThumbgateLeashEntitlement` verified on real purchase
- [ ] Default ThumbGate API points to production (`thumbgate.ai`) with per-user or org key story

---

## 4. Connection

### Shipped

- **Cloud relay** preferred when off Wi‑Fi (`connectionMode: relay`)
- **Cellular tunnel wizard** — Settings banner with steps + example URL when `cellularBlocksDirect`
- **Run progress banner** — model/tokens when `includeToolActivity`; connectivity-aware failure titles
- **Recents rail** — hides cron + Telegram inbox noise (`isRecentsRailSession`)

### Blockers

- Mac mini / home tunnel not automatic — user copies tunnel URL from desktop Hermes.
- Relay must be running and paired; no SLA for Igor's infra.

---

## 5. Dev-only vs production

| Feature | Production build | Dev/preview |
|---------|------------------|-------------|
| `EXPO_PUBLIC_HERMES_DEV_UNLOCK` | **Off** | On (EAS env) |
| Settings “Unlock Leash (dev)” button | Hidden unless dev unlock env | Visible |
| `hermes://dev-leash-unlock` deep link | Sets `developerLeashUnlock` | Igor backdoor |
| Demo mode | Blocked in release guards | Allowed in preview |

**Real users should not need `developerLeashUnlock`.** Pro IAP or free tier without Leash is the intended split.

---

## 6. E2E / CI evidence

```json
{
  "updatedAt": "2026-06-26T17:09:15Z",
  "unit": "pass",
  "e2e": "pass",
  "flows": [".maestro/ship-guard.yaml", ".maestro/chat-send-persistence.yaml"]
}
```

LaunchAgent `com.igor.hermes-mobile-continuous-e2e` — loaded, 15 min interval.

---

## Top 3 blockers for external users

1. **iOS not public; Firebase CI uncertain** — Android strangers can install from Play; iOS and Firebase paths still blocked.
2. **Mac + relay prerequisite** — onboarding is operator-shaped; no hosted Hermes for consumers.
3. **ThumbGate Leash paywall for feedback + approvals** — real value (Leash, chat thumbs capture) requires Pro subscription configured in Play; free users get chat only when gateway connected.

---

## Next actions (priority)

1. Merge real-user connectivity + chat thumbs commit; verify green `internal-distribution.yml`.
2. Complete Play Console listing → `store-release.yml` to **internal testing** track first.
3. Publish stranger onboarding doc (pair code flow) linked from Firebase release notes.
4. Validate IAP on physical device with Play license tester account.

See also: [LAUNCH_CHECKLIST.md](./LAUNCH_CHECKLIST.md), [PLAY_RELEASE.md](./PLAY_RELEASE.md), [FIREBASE_CI.md](./FIREBASE_CI.md).
