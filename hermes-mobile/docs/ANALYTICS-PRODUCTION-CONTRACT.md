# Analytics + crash observability — production contract

**GSD artifact 4.2 / 5.1** — 2026-07-15

## PostHog (product funnel)

| Item | Contract |
|------|----------|
| When | Production builds only (`isProductionPostHogBuild` + key present) |
| Host | `EXPO_PUBLIC_POSTHOG_HOST` default `https://us.i.posthog.com` |
| Key | `EXPO_PUBLIC_POSTHOG_API_KEY` from **EAS production secrets** (not committed) |
| Dogfood | `__DEV__`, preview/e2e profiles, `EXPO_PUBLIC_POSTHOG_INTERNAL=1`, developer leash unlock → **no capture** |
| Events | `app_open`, `screen_view`, `mac_scan_complete`, `leash_paywall_view`, `leash_purchase_start`, `leash_purchase_result`, `leash_restore_result`, upgrade taps |
| Opt-out | Settings → product analytics opt-out |
| Prove live | After store install: PostHog project receives `app_open` from non-dev build (checklist in REAL-USER-READINESS) |

## Sentry (crashes)

| Item | Contract |
|------|----------|
| Runtime | `EXPO_PUBLIC_SENTRY_DSN` baked into production binary (EAS env) |
| Org/project | `SENTRY_ORG=max-smith-kdp-llc`, `SENTRY_PROJECT=hermes-mobile` |
| Source maps | Production currently sets `SENTRY_DISABLE_AUTO_UPLOAD=true` so store builds never fail if upload fails (releaseSafetyContract). Upload enablement is a tracked follow-up once CI/EAS token path is proven green |
| No DSN | Soft no-op (`telemetry.ts` / init safe) |

## Funnel checklist (money path)

1. `app_open`  
2. Pair / connect Mac (instrumentation partial — extend later)  
3. `leash_paywall_view`  
4. `leash_purchase_start` → `leash_purchase_result`  
5. Optional: review prompt after first approval (`STORE_REVIEW_THRESHOLD=1`)

## Unit gates

```bash
npm test -- --watchman=false --testPathPattern='productAnalytics|telemetry|storeReview|ProUpgradeCard|versioningAndOta'
```
