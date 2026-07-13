# Social drafts — Hermes Mobile

Play: https://play.google.com/store/apps/details?id=com.iganapolsky.hermesmobile  
Public download bucket (fetched 2026-07-13): **0+** — do not invent install counts.

## Dated campaign pack (preferred for this week)

[campaign-2026-07-13/](./campaign-2026-07-13/) — Show HN, Reddit (LocalLLaMA / selfhosted / SideProject), X 5-tweet, Product Hunt, Discord pitches, agency follow-up, 7-day calendar.

## Paste-ready (Igor publishes)

| File | Channel |
|------|---------|
| [ready-to-post/01-show-hn-hermes-mobile.md](./ready-to-post/01-show-hn-hermes-mobile.md) | Show HN |
| [ready-to-post/02-reddit-localllama.md](./ready-to-post/02-reddit-localllama.md) | r/LocalLLaMA |
| [ready-to-post/03-reddit-selfhosted.md](./ready-to-post/03-reddit-selfhosted.md) | r/selfhosted |
| [ready-to-post/04-x-twitter-thread.md](./ready-to-post/04-x-twitter-thread.md) | X/Twitter (5 tweets) |
| [ready-to-post/05-reddit-androidapps.md](./ready-to-post/05-reddit-androidapps.md) | r/androidapps |
| [ready-to-post/06-product-hunt-draft.md](./ready-to-post/06-product-hunt-draft.md) | Product Hunt (gated) |
| [ready-to-post/07-agency-followup-bluefully.md](./ready-to-post/07-agency-followup-bluefully.md) | Agency B2B ($ faster than Play) |
| [ready-to-post/08-reddit-sideproject.md](./ready-to-post/08-reddit-sideproject.md) | r/SideProject |
| [ready-to-post/09-discord-community-pitches.md](./ready-to-post/09-discord-community-pitches.md) | Discord / Slack pitches |

## Automation

- **Primary 24/7:** LaunchAgent `com.igor.hermes-mobile-marketing-daily` (09:00 post nudge + 20:00 install check → `docs/proofs/marketing/latest.json`)
- Twice-daily draft generator: LaunchAgent `com.igor.hermes-mobile-social-content` → `~/.hermes-social/` + ntfy (draft-only, never auto-publishes)
- Cadence + spend gates: [../PROMOTION-PLAYBOOK.md](../PROMOTION-PLAYBOOK.md)

## Honesty rules

- Chat free; Leash = **10/week free** then **$19.99/mo** — never “unlimited free approvals”
- Paid UA (AppLovin) gated until PostHog production `app_open` proven
- No duplicate Reddit posts the same week

Strategy: [ASO-POSITIONING-SOCIAL-JULY-2026.md](../ASO-POSITIONING-SOCIAL-JULY-2026.md)
