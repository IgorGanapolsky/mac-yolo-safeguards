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

---

## Unpaid demand engine (0 → first installs)

Play Console **Installed audience = 0** is expected until distribution runs. Listing polish alone will not create installs.

### Always-on automation (this Mac)

| Piece | Path / schedule |
|-------|-----------------|
| LaunchAgent | `com.igor.hermes-mobile-promo-nudge` — **4× daily** (09:05, 13:05, 17:05, 20:05 local) |
| Script | `~/.hermes-promo/daily-publish-nudge.sh` → ntfy + draft path |
| Paste-ready posts | `hermes-mobile/docs/social/ready-to-post/` |
| UTM table | `hermes-mobile/docs/social/UTM-LINKS.md` |
| Captures | `hermes-mobile/docs/social/captures/` |

Human still publishes (HN/Reddit/X accounts). Agent stages drafts + reminds. **Do not invent install counts.**

### Daily operator loop (aggressive, not spam)

1. **Morning** — 1 proof post (approve/block screenshot) + UTM Play link  
2. **Midday** — 5 replies to people complaining about runaway agents / Cursor spend  
3. **Evening** — 1 short demo clip or thread  
4. **Night** — 3 warm DMs (agencies / operators who already use Hermes)

### Immediate free conversion lifts

1. YouTube host of 16:9 22s promo → set as Play listing video (`video` field still empty in API)  
2. iOS public only after Apple leaves `WAITING_FOR_REVIEW`  
3. First 5 real reviews from dogfood operators (not bought)
