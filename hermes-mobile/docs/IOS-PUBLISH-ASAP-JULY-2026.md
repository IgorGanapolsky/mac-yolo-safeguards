# iOS publish ASAP — Hermes Mobile (July 2026)

**Audit:** 2026-07-10 ~11:40 ET  
**Bundle:** `com.iganapolsky.hermesmobile`  
**ASC app id:** `6786778037`  
**Seller:** Igor Ganapolsky / Max Smith KDP LLC  

---

## Executive summary — why it is NOT live

| Layer | Evidence | Verdict |
|-------|----------|---------|
| **Public App Store** | `curl itunes.apple.com/lookup?bundleId=com.iganapolsky.hermesmobile` → `resultCount: 0` | **Not searchable / not live** |
| **App Store Connect** | Version **1.0** → `WAITING_FOR_REVIEW` | **In Apple's review queue** |
| **IAP** | `thumbgate_leash_monthly` → `WAITING_FOR_REVIEW` | **In review with app (updated Jul 10)** |
| **Binary** | Build **12** (0.3.2), `processingState: VALID`, `expired: false` | **Ready** |
| **Release setting** | `releaseType: AFTER_APPROVAL` | **Manual release after approval** |

**Bottom line:** The app is **submitted and waiting on Apple**. It is not live because Apple has not approved and released it yet — not because metadata is missing or no binary exists.

Latest submission: **2026-07-10T06:02:29Z** (review submission `e8d02adc-7c14-4d03-9c2a-095973367372`).

---

## Evidence snapshot (this session)

```bash
# Session start
node tools/agent-session-start.js

# ASC API
node hermes-mobile/scripts/verify-asc-listing.js --json

# Public truth
curl -s 'https://itunes.apple.com/lookup?bundleId=com.iganapolsky.hermesmobile'
```

### `verify-asc-listing.js` (2026-07-10)

| Gate | Status |
|------|--------|
| Version 1.0 | `WAITING_FOR_REVIEW` |
| en-US description | 2180 chars |
| Screenshots | iPhone 6.7 (7), 6.5 (6), iPad 12.9 (3), 1 app preview |
| `thumbgate_leash_monthly` | `WAITING_FOR_REVIEW`, review screenshot `COMPLETE` |
| `leashSubscription.readyToSubmit` | `true`, `metadataGaps: []` |
| Privacy policy URL | `https://thumbgate.ai/privacy` (on `appInfoLocalizations`) |
| Review notes | 507 chars, `hasDemo: true`, `safe: true`, no secret violations |
| Build 12 | `VALID`, uploaded 2026-07-09, `usesNonExemptEncryption: false` |

### EAS iOS production builds (today)

| Build | Status | Notes |
|-------|--------|-------|
| **12** | FINISHED | Current ASC binary; includes `EXPO_PUBLIC_STORE_REVIEW_DEMO=1`, Sentry auto-upload disabled |
| 7 | FINISHED | Superseded |
| 8 | ERRORED | Sentry upload 400 (fixed in build 12) |

---

## Blockers by priority

### P0 — must resolve for public listing

| # | Blocker | Status | Owner | Notes |
|---|---------|--------|-------|-------|
| **P0-1** | **Apple review queue** | Active | Apple | Submitted Jul 10 ~02:02 ET. First-time apps: **2–7 days** typical in July 2026 ([Apple](https://developer.apple.com/distribute/app-review/), [LaunchShots 2026](https://launchshots.app/blog/app-store-review-process-2026)). |
| **P0-2** | **Agreements, Tax, Banking** | **Unverified** | Igor | ASC API cannot read agreement state. Chrome tab hit `authResult=FAILED` 2026-07-10. **Paid Applications** + subscription agreements must be active or Apple blocks payout / may reject IAP. |
| **P0-3** | **IAP coupled to version 1.0** | **Likely OK** (verify in UI) | Igor (5 min) | IAP state moved from `READY_TO_SUBMIT` → `WAITING_FOR_REVIEW` today. Active submission has **1 item** (app version). Confirm in ASC → Distribution → v1.0 → **In-App Purchases and Subscriptions** shows `thumbgate_leash_monthly`. If missing, Apple may approve app without monetization. |

**Do NOT remove version 1.0 from review** unless Apple rejects or ASC UI proves IAP is not attached. Pulling a clean submission resets the queue (+2–7 days).

### P1 — rejection risks (fix before or immediately after first rejection)

| # | Risk | Evidence | Fix | Owner |
|---|------|----------|-----|-------|
| **P1-1** | **Subscription terms disclosure (Guideline 3.1.2)** | `ProUpgradeCard` shows price but no auto-renewal / terms / privacy links on paywall | Add standard Apple subscription footer (price, period, auto-renew, [Terms](https://www.apple.com/legal/internet-services/itunes/dev/stdeula/) + privacy link) before paywall CTA | Agent (code) |
| **P1-2** | **Demo path for reviewer** | Review notes + build 12 include `hermes://setup?demo=1` and Settings → Demo mode | **Verify on TestFlight/device** that demo activates without Mac | Agent |
| **P1-3** | **Mac-dependent product clarity** | App requires user's own Hermes gateway | Review notes already explain; ensure reviewer sees demo, not empty ConnectMacGate | Done in notes |
| **P1-4** | **Account deletion (5.1.1)** | No in-app account system (local gateway profiles only) | Low risk — no server account. If rejected, add "Clear saved Macs" in Settings as data deletion | Agent if needed |

### P2 — quality / post-launch

| # | Item | Notes |
|---|------|-------|
| P2-1 | Screenshot distinctness | Frames 01 vs 05 failed distinctness audit ([STORE-LISTING-STELLAR-JULY-2026.md](./STORE-LISTING-STELLAR-JULY-2026.md)) — unlikely first-rejection cause |
| P2-2 | App preview quality | 1 preview uploaded; content unverified |
| P2-3 | Version string mismatch | ASC marketing version **1.0** vs `app.json` **0.3.2** — cosmetic, not a blocker |
| P2-4 | Post-approval release | `AFTER_APPROVAL` — someone must click **Release** in ASC after approval |

---

## ASC gates checklist

| Gate | API / evidence | Pass? |
|------|----------------|-------|
| Binary uploaded & valid | Build 12, `VALID`, not expired | ✅ |
| Version submitted | `WAITING_FOR_REVIEW` | ✅ |
| Screenshots (6.5/6.7/iPad) | 7+6+3 + 1 preview | ✅ |
| Privacy policy URL | `https://thumbgate.ai/privacy` | ✅ |
| Privacy manifest | `app.json` `privacyManifests` (PostHog analytics) | ✅ |
| Export compliance | `usesNonExemptEncryption: false` on build 12 | ✅ |
| Age rating | API `ageRatingDeclaration` — all content flags `NONE`/false (4+) | ✅ |
| Review notes (no secrets) | 507 chars, demo path, guard clean (re-patched this pass) | ✅ |
| IAP metadata | `READY_TO_SUBMIT` → `WAITING_FOR_REVIEW`, 175 territories, $19.99 USA | ✅ |
| IAP review screenshot | `COMPLETE` | ✅ |
| Demo mode in production iOS build | `EXPO_PUBLIC_STORE_REVIEW_DEMO=1` in `eas.json` | ✅ |
| Agreements / tax / banking | **Not API-readable; Chrome auth failed** | ❓ Igor |
| IAP attached on version page | Submission item count = 1 (app only in API) | ❓ Igor UI |
| Public iTunes lookup | `resultCount: 0` | ❌ (expected until approved) |

---

## Actions taken (this pass — 2026-07-10 ~11:45 ET)

| Action | Result |
|--------|--------|
| `node tools/agent-session-start.js` | LaunchAgents OK; E2E `fail` (load guard, unrelated to iOS publish) |
| `node scripts/verify-asc-listing.js --json` | v1.0 + IAP both `WAITING_FOR_REVIEW`; review notes safe |
| `curl itunes lookup` | `resultCount: 0` — not live |
| `node scripts/patch-asc-review-notes.js` | Idempotent — 507 chars, demo path, no secrets |
| `node scripts/ensure-asc-leash-subscription.js` | IAP `WAITING_FOR_REVIEW`, screenshot `COMPLETE` |
| `node scripts/submit-asc-for-review.js` | No-op — already `WAITING_FOR_REVIEW` |
| Deep ASC API audit | Build **12** attached `VALID`; submission `e8d02adc…` at `2026-07-10T06:02:29Z` |
| Chrome ASC UI check | **Blocked** — `authResult=FAILED` on login tabs; cannot verify agreements/IAP UI |
| Pull from review | **Not done** — no rejection; submission <48h old |

**Not done (correctly):** new EAS build, pull from review, expedited review request (too early).

---

Sources: [Apple App Review](https://developer.apple.com/distribute/app-review/), [LaunchShots 2026](https://launchshots.app/blog/app-store-review-process-2026), [Silpho checklist 2026](https://silpho.com/blog/app-store-submission-checklist-2026), [Capgo first-time guide](https://capgo.app/blog/first-time-app-review-guide/).

| Scenario | Typical duration |
|----------|------------------|
| New app (first submission) | **2–7 days** (often 2–5; spikes to 7+ in peak periods) |
| App with first IAP/subscription | Treated like first submission; IAP must be `READY_TO_SUBMIT` + attached to version |
| Re-review after rejection fix | **24–72 hours** (faster than initial) |
| Expedited review (if granted) | **6–24 hours** from approval of request |
| Weekend | No reviews processed |

Apple's own page claims 90% reviewed in <24h — indie/first-submission reality in 2026 is slower (higher volume). **Plan for 3–5 business days** from Jul 10 submission.

### Common first-submission rejections (2026)

1. **2.1 App Completeness** — crashes, placeholder content, broken demo
2. **3.1.1 / 3.1.2 IAP** — external checkout, unclear subscription terms
3. **5.1.1 Privacy** — App Privacy form mismatch, missing deletion for accounts
4. **4.2 Minimum Functionality** — thin WebView shell (not our risk — native RN app)
5. **2.3 Metadata** — screenshots don't match app
6. **Missing review credentials** — mitigated by `hermes://setup?demo=1`

---

## Expedited review option

**When:** Only if review exceeds **5 business days** with no status change, or a time-sensitive launch (event, press).

**How:** [developer.apple.com/contact](https://developer.apple.com/contact/) → App Review → Request Expedited Review.

**Requirements:**
- Honest justification (first product launch with IAP is weak; critical bug fix or event is stronger)
- Apple is **selective in 2026** — repeated requests get denied
- If granted: decision in **6–24 hours**

**Do not request expedited review on day 1** — submission is <12 hours old as of this audit.

---

## Hour-by-hour fastest path

### Hours 0–2 (today, Jul 10) — Igor

| Time | Action | Why |
|------|--------|-----|
| H+0 | Log into [App Store Connect](https://appstoreconnect.apple.com) (fix Chrome `authResult=FAILED` — re-auth Apple ID) | Unblocks manual verification |
| H+0 | **Account → Agreements, Tax, and Banking** — confirm Paid Apps + subscriptions active, no red banners | P0 payout / IAP gate |
| H+0 | **Distribution → iOS App → Version 1.0** — confirm status "Waiting for Review" and **In-App Purchases** lists `thumbgate_leash_monthly` | P0 monetization coupling |
| H+1 | Install build 12 via TestFlight (if available) or ASC review build — open `hermes://setup?demo=1` | Confirm reviewer path works |
| H+2 | **Do nothing else in ASC** — no pull from review, no resubmit | Queue position preserved |

### Hours 2–72 — Agent (autonomous)

| Time | Action |
|------|--------|
| Daily | `node scripts/verify-asc-listing.js --json` + iTunes lookup |
| Daily | Monitor Igor's email for App Review messages |
| If `IN_REVIEW` | No action — wait |
| If `REJECTED` | Read Resolution Center → fix → resubmit (do not pull preemptively) |

### Hours 72–120 (Jul 13–15) — if still `WAITING_FOR_REVIEW`

| Time | Action | Owner |
|------|--------|-------|
| Day 4–5 | Request **Expedited Review** with concrete reason | Igor submits form |
| Parallel | Pre-build paywall subscription-disclosure fix (P1-1) in branch, **do not submit new binary** unless rejected | Agent |

### On `APPROVED` — Igor or agent with ASC access

| Step | Action |
|------|--------|
| 1 | ASC → Version 1.0 → **Release this version** (`AFTER_APPROVAL` requires manual release) |
| 2 | Wait 2–24h for iTunes index propagation |
| 3 | Verify: `curl itunes.apple.com/lookup?bundleId=com.iganapolsky.hermesmobile` → `resultCount: 1` |
| 4 | Sandbox IAP purchase test on real device |

---

## Agent vs Igor responsibilities

| Task | Agent | Igor |
|------|-------|------|
| ASC API verify (`verify-asc-listing.js`) | ✅ | |
| Patch review notes (`patch-asc-review-notes.js`) | ✅ | |
| IAP metadata API (`ensure-asc-leash-subscription.js`) | ✅ | |
| EAS iOS production build | ✅ (if rejection requires new binary) | |
| Agreements / tax / banking | ❌ API blocked | ✅ Account holder |
| Confirm IAP attached on version page | ❌ Chrome auth failed | ✅ 2 min UI check |
| ASC login / 2FA | ❌ | ✅ |
| Release after approval | ✅ if Chrome session works | ✅ fallback |
| Expedited review request | ❌ | ✅ |
| Paywall subscription-disclosure code fix | ✅ | |
| Reddit/HN launch posts | ❌ | ✅ |

**Never put in ASC fields:** gateway URLs, Tailscale hostnames, API keys. Demo path only: `hermes://setup?demo=1`. See [ASC-REVIEW-DEMO.md](./ASC-REVIEW-DEMO.md).

---

## Honest ETA

| Scenario | Earliest public listing |
|----------|-------------------------|
| **Best case** — approved on first pass, no weekend delay | **Jul 12–14, 2026** (Sat–Mon; weekend may push to Mon) |
| **Typical** — first-time app + IAP | **Jul 15–17, 2026** (3–5 business days from Jul 10 submit) |
| **One rejection** (e.g. subscription terms) + fix + resubmit | **+3–5 days** → Jul 18–22 |
| **Expedited granted** (if requested day 4+) | **+1 day** from grant |

**Not live today because:** Apple review is the gate, not missing submission. Submission was refreshed **today** with build 12 and IAP in review.

---

## Commands reference

```bash
# Re-verify ASC state
cd hermes-mobile
node scripts/verify-asc-listing.js --json

# Public listing check (0 = not live)
curl -sS 'https://itunes.apple.com/lookup?bundleId=com.iganapolsky.hermesmobile' | python3 -m json.tool

# Safe review notes (idempotent)
node scripts/patch-asc-review-notes.js

# IAP metadata repair (idempotent)
node scripts/ensure-asc-leash-subscription.js

# EAS iOS builds (only if rejection requires new binary)
npx eas-cli build:list --platform ios --limit 3 --json
```

---

## Related docs

- [ASC-IOS-BLOCKERS-JULY-2026.md](./ASC-IOS-BLOCKERS-JULY-2026.md) — prior blocker audit (partially superseded: IAP now `WAITING_FOR_REVIEW`)
- [ASC-REVIEW-DEMO.md](./ASC-REVIEW-DEMO.md) — reviewer demo path
- [STORE-LISTING-STELLAR-JULY-2026.md](./STORE-LISTING-STELLAR-JULY-2026.md) — ASO / screenshots
- [EMERGENCY-PUBLISH-2026-07-06.md](./EMERGENCY-PUBLISH-2026-07-06.md) — initial submit history

---

*Next update: when ASC state changes (`IN_REVIEW`, `APPROVED`, `REJECTED`) or iTunes `resultCount` becomes 1.*
