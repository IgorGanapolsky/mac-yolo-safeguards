---
type: "live-intake-fallback"
project: "restaurant-ai-answering"
source_status: "local-export"
last_verified: "2026-06-29T13:51:03+00:00"
canonical_source: "reports/gtm/2026-06-29-money-today/restaurant-live-intake-fallback.md"
---
# Restaurant Live Intake Fallback

Generated: `2026-06-29T13:46:57+00:00`

Scope: validation-only. No deploy, post, DM, email, checkout creation, phone call, or payment action was executed.

- Status: `not_ready`
- Ready: `false`
- Intake URL: `https://site-gamma-one-15.vercel.app/start-speed-to-lead?source=reddit_restaurant_phone_orders&offer=restaurant_diagnostic`
- Fit-check URL: `https://site-gamma-one-15.vercel.app/speed-to-lead?source=reddit_restaurant_phone_orders&offer=restaurant_diagnostic#fit-check`
- Checkout URL: `https://buy.stripe.com/eVq28rfCY0aOdWh5e33sI0N`

## Checks

- `PASS` `live_intake_page_200` - status=200 final_url=https://site-gamma-one-15.vercel.app/start-speed-to-lead?source=reddit_restaurant_phone_orders&offer=restaurant_diagnostic
- `FAIL` `live_intake_supports_restaurant_offer` - start-speed-to-lead has restaurant_diagnostic copy and JS branch
- `PASS` `live_intake_preserves_reddit_source` - precheckout preserves the source query value in a hidden form field
- `PASS` `live_intake_posts_checkout_intent` - precheckout form posts to /api/checkout-intent
- `PASS` `live_fit_check_page_200` - status=200 final_url=https://site-gamma-one-15.vercel.app/speed-to-lead?source=reddit_restaurant_phone_orders&offer=restaurant_diagnostic
- `PASS` `live_checkout_intent_validation_no_side_effect` - status=400 final_url=https://site-gamma-one-15.vercel.app/api/checkout-intent expected validation-only 400
- `PASS` `live_restaurant_checkout_200` - status=200 final_url=https://buy.stripe.com/eVq28rfCY0aOdWh5e33sI0N

## Operating Rule

Use this direct intake path only in an approved close reply after buyer intent. The dedicated landing page still requires `APPROVE DEPLOY RESTAURANT AI ANSWERING ROUTE` before broad buyer traffic.
