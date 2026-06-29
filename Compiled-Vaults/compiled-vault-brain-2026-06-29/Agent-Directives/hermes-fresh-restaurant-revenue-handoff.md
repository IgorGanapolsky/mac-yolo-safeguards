---
type: "fresh-session-handoff"
project: "restaurant-ai-answering"
source_status: "local-export"
last_verified: "2026-06-29T13:51:03+00:00"
canonical_source: "reports/gtm/hermes-fresh-revenue-handoff.md"
---
# Hermes Fresh Revenue Handoff

Generated: `2026-06-29T10:37:24+00:00`

## Why

Use this when Hermes CLI shows a high compression count or starts losing project state. Start a fresh session from these artifacts instead of continuing a degraded transcript.

## Current Money Truth

- Active offer: `Restaurant AI answering diagnostic`
- Diagnostic price: `$499.00`
- Buyer route: `https://site-gamma-one-15.vercel.app/restaurant-ai-answering`
- Checkout URL: `https://buy.stripe.com/eVq28rfCY0aOdWh5e33sI0N`
- Top approval keyword: `APPROVE DEPLOY RESTAURANT AI ANSWERING ROUTE`
- Stripe captured today: `$0.00`
- Stripe live charges ready: `true`
- Stripe payouts ready: `true`
- Stripe blockers: `[]`
- Next-dollar score: `78.5`
- Intent spec: `/Users/igorganapolsky/workspace/git/igor/skool_top1percent/docs/hermes-revenue-operator.intent.md`

## Restaurant State

- deploy_status: `waiting_for_exact_deploy_approval`
- live_route_ready: `False`
- live_checkout_ready: `True`
- payment_status: `waiting_for_payment`
- payment_detected: `False`
- close_packet: `/Users/igorganapolsky/workspace/git/igor/skool_top1percent/sales/close-packet-restaurant-answering-ai-restaurant-empire.md`
- deploy_request: `/Users/igorganapolsky/workspace/git/igor/skool_top1percent/reports/gtm/restaurant-deploy-approval-request.json`
- payment_readiness: `/Users/igorganapolsky/workspace/git/igor/skool_top1percent/reports/gtm/2026-06-29-money-today/restaurant-payment-fulfillment-readiness.json`
- fulfillment_packet: `/Users/igorganapolsky/workspace/git/igor/skool_top1percent/reports/gtm/2026-06-29-money-today/restaurant-paid-diagnostic-fulfillment.md`
- compiled_vault_routing: `/Users/igorganapolsky/workspace/git/igor/mac-yolo-safeguards/Compiled-Vaults/compiled-vault-brain-2026-06-29/Routing/restaurant-ai-answering-routing.json`

## Top Queue Item

- Status: `prerequisite_approval`
- Target: `Restaurant AI answering buyer route deploy readiness`
- Next step: Ask for exact restaurant deploy approval, then run the approval-gated deploy runner and verify /restaurant-ai-answering returns 200 before sending buyer traffic there.

## Fresh Session Commands

```bash
cd /Users/igorganapolsky/workspace/git/igor/skool_top1percent && hermes --cli --oneshot "$(cat /Users/igorganapolsky/workspace/git/igor/skool_top1percent/reports/gtm/hermes-fresh-revenue-handoff-prompt.txt)"
```

Interactive alternative:

```bash
cd /Users/igorganapolsky/workspace/git/igor/skool_top1percent && hermes --cli
# then paste: /Users/igorganapolsky/workspace/git/igor/skool_top1percent/reports/gtm/hermes-fresh-revenue-handoff-prompt.txt
```

## Restaurant Notes

- `restaurant diagnostic close packet` (`/Users/igorganapolsky/workspace/git/igor/skool_top1percent/sales/close-packet-restaurant-answering-ai-restaurant-empire.md`): $499 restaurant/POS diagnostic is the active money wedge.
- `restaurant deploy approval request` (`/Users/igorganapolsky/workspace/git/igor/skool_top1percent/reports/gtm/restaurant-deploy-approval-request.json`): Public buyer route deploy is approval-gated and must not run without the exact deploy keyword.
- `restaurant payment fulfillment readiness` (`/Users/igorganapolsky/workspace/git/igor/skool_top1percent/reports/gtm/2026-06-29-money-today/restaurant-payment-fulfillment-readiness.json`): Paid delivery is ready to stage, but must wait for live Stripe payment truth.

## Prompt

```text
You are Hermes running a fresh bounded Restaurant AI Answering Revenue Operator session.

Do not resume an old compressed chat. Do not use stale memory as truth.
Project root: /Users/igorganapolsky/workspace/git/igor/skool_top1percent

Load only these current artifacts first:
- /Users/igorganapolsky/workspace/git/igor/skool_top1percent/docs/hermes-revenue-operator.intent.md
- /Users/igorganapolsky/workspace/git/igor/mac-yolo-safeguards/Compiled-Vaults/compiled-vault-brain-2026-06-29/Routing/restaurant-ai-answering-routing.json
- /Users/igorganapolsky/workspace/git/igor/skool_top1percent/reports/gtm/stripe_readiness.json
- /Users/igorganapolsky/workspace/git/igor/skool_top1percent/reports/gtm/hermes-money-action-queue.json
- /Users/igorganapolsky/workspace/git/igor/skool_top1percent/reports/gtm/hermes-codex-coordination.json
- /Users/igorganapolsky/workspace/git/igor/skool_top1percent/reports/gtm/next-dollar-distance.json
- /Users/igorganapolsky/workspace/git/igor/skool_top1percent/reports/gtm/restaurant-deploy-approval-request.json
- /Users/igorganapolsky/workspace/git/igor/skool_top1percent/reports/gtm/2026-06-29-money-today/restaurant-payment-fulfillment-readiness.json
- /Users/igorganapolsky/workspace/git/igor/skool_top1percent/reports/gtm/2026-06-29-money-today/restaurant-paid-diagnostic-fulfillment.md
- /Users/igorganapolsky/workspace/git/igor/skool_top1percent/sales/close-packet-restaurant-answering-ai-restaurant-empire.md

Current verified money state:
- Stripe captured today: $0.00
- Stripe live charges ready: True
- Stripe payouts ready: True
- Stripe blockers: []
- Restaurant diagnostic price: $499.00
- Restaurant payment fulfillment status: waiting_for_payment
- Restaurant live route ready: False
- Restaurant checkout ready: True
- Next-dollar score: 78.5

Current queue state:
- Top status: prerequisite_approval
- Top target: Restaurant AI answering buyer route deploy readiness
- Top next step: Ask for exact restaurant deploy approval, then run the approval-gated deploy runner and verify /restaurant-ai-answering returns 200 before sending buyer traffic there.
- Coordination next status: waiting_for_action_time_approval
- Coordination next target: Restaurant AI answering buyer route deploy readiness

Rules:
- Active wedge is the $499 Restaurant AI answering diagnostic.
- Do not deploy, post, DM, email, submit forms, send checkout, start paid fulfillment, or change billing without the exact approval phrase from the current local packet.
- If top action is the restaurant deploy prerequisite, ask for exact deploy approval and do not run deploy commands yourself unless that exact approval is present.
- If a restaurant buyer asks for price/link/proof/deliverables while the route is pending, use the route-pending bridge approvals from the restaurant approval execution packet.
- Manual checkout is allowed only after the buyer supplied restaurant URL, POS/menu surface, costly workflow path, and asks to pay.
- Keep the active offer/niche/price unchanged: restaurant AI answering diagnostic at $499.
- Report one next revenue action, result, timestamp, and post-turn next-dollar score.
- If Igor sends only 'continue', 'proceed', 'are you sure', or 'print money', reload the intent spec and answer from these artifacts.
```
