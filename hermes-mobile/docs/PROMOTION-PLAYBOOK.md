# Hermes Mobile promotion playbook

**Updated:** 2026-07-13

## Reality check (do not over-claim)

| Signal | Evidence (2026-07-13) | Implication |
|--------|----------------------|-------------|
| Public Play download bucket | Store page shows **0+** | Zero organic scale yet — unpaid acquisition is the lever |
| Play Console “Installed audience: 0” | Operator report, Production, last updated Jul 13 | Consistent with 0+ public bucket |
| Blue banner: “Go to Android developer verification” | Play Console | **Does not block ranking/ads today.** Enforcement for unverified installs begins **2026-09-30** in select regions (BR/ID/SG/TH), wider later. Complete identity verification ASAP (human ID docs). Play-distributed apps are usually auto-registered once the developer completes verification. |
| Play payments / merchant | IAP SKU `thumbgate_leash_monthly` @ $19.99 wired; merchant/tax incomplete → billing unavailable for buyers | Blocks **revenue**, not organic ranking. Fix before scaling traffic that hits paywall. |
| Paid UA (AppLovin) | Gated below | **Do not spend** until PostHog production gates pass |

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

Organic UTMs:

```text
hermes://chat?utm_source=hn&utm_medium=launch&utm_campaign=runaway-agent-jul2026
hermes://chat?utm_source=reddit&utm_medium=organic&utm_campaign=localllama-jul2026
```

## Spend gates (paid UA)

Do not spend on paid acquisition until all of these are true:

- Store submission succeeds for the current `com.iganapolsky.hermesmobile` package.
- PostHog receives `app_open` from a **production** build (not USB dogfood only).
- PostHog receives `leash_paywall_view` and `leash_purchase_result` with attribution fields.
- Google Play / App Store subscription `thumbgate_leash_monthly` is live or sandbox-proven.
- Crash reporting and full unit gates are green.

## 24/7 unpaid acquisition cadence

**Dated campaign pack (2026-07-13):** [docs/social/campaign-2026-07-13/](./social/campaign-2026-07-13/)  
**Ongoing paste folder:** [docs/social/ready-to-post/](./social/ready-to-post/)

| Cadence | Action | Owner |
|---------|--------|-------|
| **Daily 09:00 local** | LaunchAgent **`com.igor.hermes-mobile-marketing-daily`** morning mode → ntfy *“Hermes Mobile: post Show HN / Reddit draft today”* + draft path | Automation → **Igor publishes** |
| **Daily 20:00 local** | Same LaunchAgent evening mode → scrape Play public download bucket (+ best-effort Play API) → `docs/proofs/marketing/latest.json` + ntfy | Automation |
| **2×/day** | Draft generator LaunchAgent `com.igor.hermes-mobile-social-content` → `~/.hermes-social/drafts/` + ntfy | Automation (draft-only; never auto-publishes) |
| **Legacy (optional)** | `com.igor.hermes-mobile-promo-nudge` (09:05/17:05) — superseded by `marketing-daily`; safe to bootout if duplicate ntfy | Host-only |
| **Mon** | Stage Show HN title+body | Igor |
| **Tue–Thu ~9am PT** | Post Show HN **or** r/LocalLLaMA (one channel) | Igor |
| **Thu–Fri** | r/SideProject **or** r/selfhosted (one; no same-week duplicates) | Igor |
| **Sat** | X/Twitter **5-tweet** thread | Igor |
| **Sun** | Agency B2B follow-up (Partner Pilot) + one Discord helpful reply | Igor |
| **Ongoing** | Product Hunt stays **draft-only** until iOS searchable or explicit Android-only launch + IAP proof | Gated |

Install / repair marketing LaunchAgent (repo template):

```bash
bash scripts/install-agent-launchagents.sh
launchctl list | grep hermes-mobile-marketing-daily
```

Script: `hermes-mobile/scripts/hermes-mobile-marketing-daily.sh` (`morning` | `evening` | `auto`).

### Honesty rules for every post

- Chat free; Leash = **10 routed approvals/week free**, then **$19.99/mo** — never “unlimited free approvals”
- Requires Mac (or Linux/Windows) gateway + Tailscale for cellular
- Never claim Play install counts without Console proof (current public bucket: **0+**)

### Faster $ than Play installs

Pipeline DS (agency segment) → [ready-to-post/07-agency-followup-bluefully.md](./social/ready-to-post/07-agency-followup-bluefully.md). Partner Pilot $3,000 Stripe link already live.

## Android developer verification — agent vs human

1. Play Console → blue banner **Go to Android developer verification** (account-level).
2. Complete identity / business docs Google requests (passport/driver license / DUNS as applicable) — **human identity; agents cannot finish this**.
3. Confirm Hermes package is registered under the verified developer.
4. Until Sep 30 2026 regional enforcement, this banner does **not** explain 0 installs — lack of marketing + niche TAM does.

## Payments blocker

- Incomplete Play merchant / tax / banking → buyers see billing unavailable → **revenue = $0** even if traffic arrives.
- Does **not** by itself zero organic ranking, but kills conversion and makes paid UA suicidal.
- Proof path: [PLAY-LICENSE-TESTER-IAP.md](./PLAY-LICENSE-TESTER-IAP.md)

## Reporting cuts

Track these PostHog views before scaling:

- Day 0 CPP: installs, `app_open`, paywall views, purchase starts, purchase results by `attribution_campaign`.
- Day 7 ROAS: purchase results and restore results by `first_attribution_campaign` and `attribution_campaign`.
- Creative fatigue: purchase start rate by `attribution_creative_id`.
- Funnel breakage: `leash_purchase_start` without `leash_purchase_result` within the same day.

## Related

- [MONETIZATION-GTM-JULY-2026.md](./MONETIZATION-GTM-JULY-2026.md)
- [MONETIZATION-PROMOTION.md](./MONETIZATION-PROMOTION.md)
- [social/README.md](./social/README.md)
