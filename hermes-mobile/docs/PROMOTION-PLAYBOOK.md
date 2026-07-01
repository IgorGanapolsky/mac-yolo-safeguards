# Hermes Mobile promotion playbook

## Source pattern

AppLovin's Wuffes case study emphasizes three useful launch mechanics for Hermes Mobile:

- Run a cost-per-purchase campaign for predictable acquisition volume.
- Run ROAS optimization for higher-value shoppers after signal quality exists.
- Separate Day 0 and Day 7 optimization windows instead of judging every click by the same clock.

Reference: https://applovin.com/en/case-study-blog-wuffes

## Implemented measurement

Hermes Mobile now records paid-link attribution from deep links before routing:

- First touch and last touch are stored locally.
- `utm_source`, `utm_medium`, `utm_campaign`, `utm_content`, `utm_term`, `campaign_id`, `adgroup_id`, `creative_id`, and `network` are normalized.
- Campaigns containing `day7`, `d7`, or `retarget` are tagged `day7`; all others default to `day0`.
- Product analytics events include attribution properties automatically.
- Leash upgrade cards emit `leash_paywall_view`, `leash_purchase_start`, `leash_purchase_result`, and `leash_restore_result`.

## Campaign naming

Use links like:

```text
hermes://chat?utm_source=applovin&utm_medium=cpp&utm_campaign=day0-leash-install&campaign_id=...&creative_id=...
hermes://leash?utm_source=applovin&utm_medium=roas&utm_campaign=day7-leash-retarget&campaign_id=...&creative_id=...
```

## Spend gates

Do not spend on paid acquisition until all of these are true:

- Store submission succeeds for the current `com.iganapolsky.hermesmobile` package.
- PostHog receives `app_open` from a production build.
- PostHog receives `leash_paywall_view` and `leash_purchase_result` with attribution fields.
- Google Play / App Store subscription `thumbgate_leash_monthly` is live or sandbox-proven.
- Crash reporting and full unit gates are green.

## Reporting cuts

Track these PostHog views before scaling:

- Day 0 CPP: installs, `app_open`, paywall views, purchase starts, purchase results by `attribution_campaign`.
- Day 7 ROAS: purchase results and restore results by `first_attribution_campaign` and `attribution_campaign`.
- Creative fatigue: purchase start rate by `attribution_creative_id`.
- Funnel breakage: `leash_purchase_start` without `leash_purchase_result` within the same day.
