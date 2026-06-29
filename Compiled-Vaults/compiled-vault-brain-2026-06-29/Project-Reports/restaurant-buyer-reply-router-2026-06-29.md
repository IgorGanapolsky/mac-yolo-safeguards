---
type: "buyer-reply-router"
project: "restaurant-ai-answering"
source_status: "local-export"
last_verified: "2026-06-29T13:51:03+00:00"
canonical_source: "reports/gtm/2026-06-29-money-today/restaurant-buyer-reply-router.md"
---
# Restaurant Buyer Reply Router

Generated: `2026-06-29T13:49:21+00:00`

Scope: local routing only. No post, DM, email, checkout link, deploy, form submission, phone call, or payment action was executed.

- Close packet status: `waiting_for_live_intake_or_deploy`
- Manual checkout ready: `true`
- Payment fulfillment status: `waiting_for_payment`
- Classification: `no_buyer_reply_supplied`
- Status: `waiting_for_buyer_reply`
- Approval keyword: `none`
- Scenario: `none`
- External side effect if approved: `false`

## Missing Manual Checkout Requirements

- explicit_payment_intent_or_checkout_request
- restaurant_url
- pos_or_menu_surface
- costly_interaction_path

## Manual Checkout Evidence

- Ready for manual checkout approval: `false`
- Manual checkout packet ready: `true`
- Payment fulfillment status: `waiting_for_payment`
- Payment already detected: `false`
- Explicit payment intent or checkout request: `false`
- Restaurant URL supplied: `false`
- POS/menu surface supplied: `false`
- Costly interaction path supplied: `false`
- Rule: Only request manual-checkout approval when ready=true. Otherwise use bridge/close routing and do not send a payment link.

## Reason

No buyer reply text was supplied to classify.

## Exact Text If Approved

```text
No reply text is ready for approval.
```
