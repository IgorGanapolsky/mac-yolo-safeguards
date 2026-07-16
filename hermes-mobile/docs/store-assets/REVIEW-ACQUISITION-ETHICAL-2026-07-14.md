# Ethical review acquisition — Hermes Mobile (2026-07-14)

## Policy line

- **Never** buy reviews, incentivize star ratings, or use review farms.
- **Never** ask before the user has real product value (early prompts hurt ratings).
- Comply with [Google Play reviews policy](https://support.google.com/googleplay/android-developer/answer/9898684).

## In-app path (shipped)

| Setting | Value | File |
|---------|-------|------|
| Trigger | After **5** successful Leash approvals | `src/services/storeReview.ts` |
| Frequency | Once per install | `storage.hasRequestedReview()` |
| API | `expo-store-review` native sheet | Android In-App Review |

## Organic paths

1. Variant C traffic → install → pair → Leash use
2. Native prompt at approval #5 (happy moment)
3. Ethical Igor network ask (3–5 real users, no incentive)
4. Reply to all Play reviews within 48h once they appear

## PostHog

Production-only cohort via `shouldReportToPostHog()` — dashboard filter #305.

## Target

≥5 reviews at ≥4.0★ within 14 days post-traffic.
