# Executive metrics snapshot — 2026-07-15 (GSD 5.1)

| Metric | Value | Source |
|--------|-------|--------|
| Play public | Live, Teen, **1+** downloads, trailer live | play.google.com scrape |
| Play FAQ | **iOS live** (CDN fixed) | public HTML + Publisher API |
| Play IAP | `thumbgate_leash_monthly` **ACTIVE** $19.99 | Play API |
| App Store | **1.0 READY_FOR_SALE** build 14 | ASC API |
| App Store 1.1 | **WAITING_FOR_REVIEW** build 16 | ASC API |
| Live iOS subtitle | Still brand-risky until 1.1 ships | ASC appInfo READY_FOR_SALE |
| iTunes ratings | **0** | lookup id 6786778037 |
| Production OTA | Active runtime **1.0** | eas channel:list |
| PostHog | Wired; production key in EAS | eas env list (names) |
| Sentry | Org/project set; DSN via EAS; maps upload enabled on production profile (this PR) | eas.json |
| Cleared revenue | **No proof** of paid IAP/Stripe | pipeline DS not revenue proof |
| SLE | Short A vs hybrid C documented in Console (max experiments) | STORE-EXPERIMENTS-READY |

**Bottleneck:** traffic + first review + first purchase — not more listing creative.
