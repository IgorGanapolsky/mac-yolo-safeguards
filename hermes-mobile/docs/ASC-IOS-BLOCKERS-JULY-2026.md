# App Store Connect — iOS blockers (Hermes Mobile 1.0)

**Updated:** 2026-07-11 ~10:40 ET (IAP `DEVELOPER_ACTION_NEEDED` regression confirmed)

## Jul 11 regression — IAP `DEVELOPER_ACTION_NEEDED`

**Evidence** (`node scripts/verify-asc-listing.js --json`, 2026-07-11 ~10:36 ET):

| Item | Jul 10 (prior audit) | Jul 11 (now) |
|------|----------------------|--------------|
| Version **1.0** | `WAITING_FOR_REVIEW` | `WAITING_FOR_REVIEW` (resubmitted `caea665c…`) |
| IAP `thumbgate_leash_monthly` | `WAITING_FOR_REVIEW` | **`DEVELOPER_ACTION_NEEDED`** |
| `leashSubscription.readyToSubmit` | `true` | **`false`** |
| IAP en-US localization | In review | **`REJECTED`** (API: `409 Cannot edit when REJECTED`) |
| Active submission items | 1 (app only) | 1 (app only — IAP still not coupled) |

**Root cause (API + prior rejection triage):** First subscription was rejected with the app; localization locked `REJECTED`. API cannot cancel the rejected localization change or attach IAP to the in-flight submission (`reviewSubmissionItems` rejects `subscription` relationship; `subscriptionAppStoreReviewSubmissions` → 404).

**Agent reference — Igor ASC UI steps (cannot automate):**

1. [App Store Connect](https://appstoreconnect.apple.com) → **Agreements, Tax, and Banking** — confirm Paid Apps + subscriptions active (no red banners).
2. **Monetization → Subscriptions → Leash Pro → Hermes Pro Monthly (`thumbgate_leash_monthly`)** → dismiss/cancel the **rejected en-US localization change** (yellow banner) until state is `READY_TO_SUBMIT`.
3. **Distribution → iOS App → Version 1.0 → In-App Purchases and Subscriptions → +** → select `thumbgate_leash_monthly`.
4. **Submit** subscription with version 1.0 (first subscription must ship on the same submission as the binary).
5. Re-verify: `node scripts/verify-asc-listing.js --json` — target IAP state ∈ `READY_TO_SUBMIT` / `WAITING_FOR_REVIEW`.

**Code fixes merged separately (agent):** Guideline 3.1.2 paywall legal footer (`ProUpgradeCard`), demo gate escape (`ConnectMacGate` + build **13**). EAS build 13 required if Apple cites 3.1.2 on binary review.

---

## Review notes (fixed)

App Review Information notes were patched via `node scripts/patch-asc-review-notes.js` — demo path `hermes://setup?demo=1` only; **no** operator gateway URLs or API keys. See [ASC-REVIEW-DEMO.md](./ASC-REVIEW-DEMO.md).

## Current ASC state (API)

| Item | Value |
|------|--------|
| App | Hermes Mobile — AI Control (`com.iganapolsky.hermesmobile`, app id `6786778037`) |
| Version **1.0** | `WAITING_FOR_REVIEW` |
| Review submission | `9013e09a-3aa9-481b-b4ce-fc97bca82745` — `WAITING_FOR_REVIEW` (includes **app version only**, not subscription) |
| Listing metadata | en-US description ~1319 chars; iPhone 6.5/6.7 + iPad + 1 app preview present |
| Privacy policy URL | **`https://thumbgate.ai/privacy`** on `appInfoLocalizations` en-US (`e5cb7b2a-f43c-40f5-ace4-e6248c8fd1f7`) — set/confirmed via ASC API PATCH |
| Subscription group | Leash Pro (`22213637`), en-US localization present |
| IAP `thumbgate_leash_monthly` | Subscription id `6788168309`, **state `WAITING_FOR_REVIEW`** (was `READY_TO_SUBMIT` Jul 9) |
| IAP API-filled fields | en-US name/description, territory prices, review screenshot `COMPLETE`, `availableInNewTerritories: true` |
| IAP localization state | In review with product (`WAITING_FOR_REVIEW`) |
| IAP root cause (fixed) | `availableInNewTerritories: true` required pricing for all territories; only USA was priced → `MISSING_METADATA` |
| Public App Store | `itunes lookup` → **0 results** (not searchable / not live) |

**Note:** `verify-asc-listing.js` reads `privacyPolicyUrl` from `appInfos`, which does not expose that field. The live URL is on **`appInfoLocalizations`**. A null there is a script gap, not a missing store field.

## What automation already did (this session)

1. `node scripts/verify-asc-listing.js` — gaps: `MISSING_METADATA`, false-null privacy on `appInfos`.
2. `node scripts/ensure-asc-leash-subscription.js` — group/loc/price/screenshot already present; subscription still `MISSING_METADATA`.
3. PATCH `appInfoLocalizations` en-US → `privacyPolicyUrl: https://thumbgate.ai/privacy` (idempotent).

## Security (2026-07-09)

App Review notes must **never** contain operator gateway URLs, Tailscale hostnames, or API keys. Use `hermes://setup?demo=1` only. Guard: `node scripts/verify-asc-listing.js` (fails on `ts.net` / `sk-hermes-api` in notes). Emergency redact: `node scripts/asc-chrome-redact-review-notes.js`.

## Blockers to **public** listing

1. **Apple review queue** — binary + metadata submitted; app not approved/released yet (`WAITING_FOR_REVIEW`). Submitted **2026-07-10T06:02:29Z** with build 12.
2. **Agreements / tax / banking** — **unverified** (ASC API has no agreements endpoint for this key; Chrome `authResult=FAILED`). Igor must confirm Paid Applications agreement active.
3. **IAP version-page attachment** — product is `WAITING_FOR_REVIEW` (improvement). API still cannot confirm IAP is listed on version 1.0 page; Igor 2-min UI check recommended. **Do not pull from review** unless Apple rejects.
4. **Monetization parity** — IAP must reach `APPROVED` with app; currently both `WAITING_FOR_REVIEW`.

Play Android is **out of scope** here (already verified correct elsewhere).

## Manual ASC steps (attach IAP to version 1.0 review)

Metadata/pricing is **API-complete** (`READY_TO_SUBMIT`). Remaining work is **UI-only** because the first subscription must ship with an app version and the active submission is locked.

Do these in [App Store Connect](https://appstoreconnect.apple.com) (sign in as account with ASC access — Chrome automation hit `authResult=FAILED` 2026-07-09):

1. **Agreements, Tax, and Banking** — Account → confirm **Paid Applications** (and subscriptions) agreements active; tax/banking complete.

2. **Attach IAP to version 1.0** — App → **Distribution** → iOS App → version **1.0** → **In-App Purchases and Subscriptions** → **+** → select **Leash Pro / thumbgate_leash_monthly**.

3. **Submit subscription with version** — If version 1.0 is already `Waiting for Review` and UI blocks edits, Apple requires the **first subscription** on the same submission as the app. Options (UI-only):
   - Add IAP to the in-review version if ASC allows (some accounts can while waiting).
   - Otherwise: **remove version 1.0 from review** → attach IAP → **resubmit app + subscription together** (only if step 2 is blocked).

4. **Re-verify** (agent/local):

   ```bash
   node scripts/verify-asc-listing.js
   ```

   Target: `thumbgate_leash_monthly.state` ∈ `READY_TO_SUBMIT`, `WAITING_FOR_REVIEW`, or `APPROVED`; `leashSubscription.readyToSubmit: true`.

6. **After approval** — release version 1.0 (release type is `AFTER_APPROVAL`). Re-check public lookup:

   ```bash
   curl -sS 'https://itunes.apple.com/lookup?bundleId=com.iganapolsky.hermesmobile'
   ```

## Commands reference

```bash
cd hermes-mobile
node scripts/verify-asc-listing.js
node scripts/ensure-asc-leash-subscription.js
node scripts/submit-asc-for-review.js   # no-op if already WAITING_FOR_REVIEW
```
