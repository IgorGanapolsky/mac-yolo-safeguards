# PostHog — production-only analytics contract

**Last updated:** 2026-07-13  
**Gate:** `shouldReportToPostHog()` in `src/services/productAnalytics.ts`

## Goal

PostHog counts **real store users only**. Igor dogfood, dev builds, E2E automation, preview/Firebase APKs, and developer backdoors must **never** emit product or crash events.

## What reports (after this change)

| Condition | Reports? |
|-----------|----------|
| Play/App Store production build (`EAS_BUILD_PROFILE=production`) | Yes |
| Local release APK **without** internal flags (stranger testing) | Yes |
| User left analytics on in Settings (default on) | Yes |

## What is blocked

| Signal | Layer | Why |
|--------|-------|-----|
| `__DEV__` (Metro) | Build | Local dev |
| `EAS_BUILD_PROFILE` ≠ `production` (preview, development, e2e-test) | Build | Internal/Firebase/E2E APKs |
| `EXPO_PUBLIC_HERMES_DEV_UNLOCK` | Build | Preview/E2E env in `eas.json` |
| `EXPO_PUBLIC_E2E_AUTOMATION` | Build | Maestro builds |
| `EXPO_PUBLIC_STORE_REVIEW_DEMO` | Build | ASC review demo |
| `EXPO_PUBLIC_POSTHOG_INTERNAL=1` | Build | Igor-only local `.env` flag |
| `developerLeashUnlock` persisted | Runtime | Igor 7-tap / deep-link backdoor |
| `storeLeashPreviewActive` | Runtime | ASC review Leash preview |
| `demoMode` | Runtime | Demo deep link sessions |
| `analyticsOptOut` in Settings | Runtime | User privacy toggle |

## Igor exclusion (without blocking strangers)

1. **Build flag (recommended):** Add to Igor's local `.env` (never committed, never in production EAS):
   ```bash
   EXPO_PUBLIC_POSTHOG_INTERNAL=1
   ```
   Rebuild phone APK after adding. Play Store production builds do **not** set this.

2. **Runtime backdoor:** Igor's phone almost always has `developerLeashUnlock=true` from 7-tap Leash tab or `hermes://dev-leash-unlock`. That alone blocks all events on an otherwise-production APK.

3. **Settings opt-out:** Toggle **Product analytics** off under Privacy — already wired to `setProductAnalyticsOptOut`.

4. **Stranger testing:** Cold install without backdoor and without `POSTHOG_INTERNAL` reports correctly — that's the intended real-user signal.

## Identity / PII

- Product events use anonymous `hm_<timestamp>_<random>` distinct IDs stored in AsyncStorage.
- **No email, no Igor identity** is sent in production builds.
- Crash flush uses a fixed `hermes-mobile-crash` distinct ID (no user PII).
- PostHog may infer `$ip` server-side from the capture request; we do not send email or name.

## EAS / env reference

| Profile | PostHog key | Internal flags |
|---------|-------------|----------------|
| `production` | EAS secret `EXPO_PUBLIC_POSTHOG_API_KEY` | None |
| `preview` | Not set | `EXPO_PUBLIC_HERMES_DEV_UNLOCK=1` |
| `development` | Not set | dev client + dev unlock |
| `e2e-test` | Not set | E2E + dev unlock |

## Verification

```bash
cd hermes-mobile
npm test -- --no-coverage --watchman=false --testPathPattern='productAnalytics|crashReporting'
```

## Related

- [PROMOTION-PLAYBOOK.md](./PROMOTION-PLAYBOOK.md) — spend gates require production `app_open`
- [REAL-USER-READINESS.md](./REAL-USER-READINESS.md) — dev-only vs production table
