# Analytics + crash observability — production contract

**Updated 2026-07-21** (T-ANALYTICS-REAL-USER) — GSD artifact 4.2 / 5.1

## PostHog (product funnel + Error Tracking)

| Item | Contract |
|------|----------|
| When | Production builds only (`isProductionPostHogBuild` + key present) |
| Host | `EXPO_PUBLIC_POSTHOG_HOST` default `https://us.i.posthog.com` |
| Key | `EXPO_PUBLIC_POSTHOG_API_KEY` from **EAS production environment** (not committed) |
| Channel bake | EAS production also sets `EXPO_PUBLIC_EAS_PROFILE=production` and `EXPO_PUBLIC_UPDATES_CHANNEL=production` so the fail-closed gate is not empty at runtime / OTA |
| Endpoint | `/i/v0/e/` (single-event capture) |
| Dogfood | `__DEV__`, preview/e2e profiles, `EXPO_PUBLIC_POSTHOG_INTERNAL=1`, developer leash unlock, store leash preview → **no capture** |
| Product events | `app_open`, `screen_view`, `mac_scan_complete`, `leash_paywall_view`, `leash_purchase_start`, `leash_purchase_result`, `leash_restore_result`, upgrade taps |
| Exceptions | Crash queue flushes as PostHog **`$exception`** with `$exception_list` (Error Tracking). Custom names like `ui_crash` alone do **not** populate Error Tracking. |
| Opt-out | Settings → product analytics opt-out |
| Gate reason | `getPostHogEnvironmentBlockReason()` — null when environment allows |
| Prove live | Production-channel store/OTA user generates `app_open` in project **493899**; Error Tracking receives `$exception` after a real crash flush |

### Exact gates that still block (fail-closed — intentional)

1. `__DEV__` Metro / debug
2. EAS profile or Updates channel not `production` (preview / development / e2e-test)
3. `EXPO_PUBLIC_POSTHOG_INTERNAL=1` (local dogfood `.env`)
4. `developerLeashUnlock` or `storeLeashPreview` runtime flags
5. Missing `EXPO_PUBLIC_POSTHOG_API_KEY`
6. Settings analytics opt-out

Igor's USB/dogfood phone with leash unlock or `POSTHOG_INTERNAL` will correctly show **zero** events — that is not a production outage.

## Sentry (crashes)

| Item | Contract |
|------|----------|
| Runtime | `EXPO_PUBLIC_SENTRY_DSN` baked into production binary (EAS env — present) |
| Org/project | `SENTRY_ORG=max-smith-kdp-llc`, `SENTRY_PROJECT=hermes-mobile` |
| Source maps | Production currently sets `SENTRY_DISABLE_AUTO_UPLOAD=true` so store builds never fail if upload fails (releaseSafetyContract). Upload enablement is a tracked follow-up once CI/EAS token path is proven green |
| No DSN | Soft no-op (`telemetry.ts` / init safe) |
| Dark project | DSN in EAS does not prove live issues — needs a production binary that has the DSN + a real crash. Dogfood gates do not apply to Sentry init (only PostHog). |

## Funnel checklist (money path)

1. `app_open`  
2. Pair / connect Mac (instrumentation partial — extend later)  
3. `leash_paywall_view`  
4. `leash_purchase_start` → `leash_purchase_result`  
5. Optional: review prompt after first approval (`STORE_REVIEW_THRESHOLD=1`)

## Unit gates

```bash
npm test -- --watchman=false --testPathPattern='productAnalytics|crashReporting|telemetry|storeReview|ProUpgradeCard|versioningAndOta'
```
