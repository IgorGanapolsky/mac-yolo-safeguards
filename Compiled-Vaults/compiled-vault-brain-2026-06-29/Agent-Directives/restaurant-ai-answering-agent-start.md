---
type: "agent-start"
project: "restaurant-ai-answering"
source_status: "local-export"
last_verified: "2026-06-29T13:54:46+00:00"
---
# Restaurant AI Answering Agent Start

## Current Objective

Earn `$300/day after tax` from the restaurant agentic AI answering effort.

## Read Order

1. `Routing/restaurant-ai-answering-routing.json`
2. `Status/restaurant-ai-answering-current-state.md`
3. `Project-Reports/restaurant-hermes-money-action-queue.md`
4. `Project-Reports/restaurant-hermes-codex-coordination.md`
5. `Project-Reports/restaurant-hermes-next-action-alert.md`
6. `Project-Reports/restaurant-hermes-approval-nudge.md`
7. `Agent-Directives/hermes-fresh-restaurant-revenue-handoff.md`
8. `Agent-Directives/hermes-revenue-operator-intent.md`
9. `Project-Reports/restaurant-payment-fulfillment-readiness-2026-06-29.md`
10. `Project-Reports/restaurant-manual-checkout-readiness-2026-06-29.md`
11. `Project-Reports/restaurant-buyer-reply-router-2026-06-29.md`
12. `Project-Reports/restaurant-public-market-intel-2026-06-29.md`
13. `Project-Reports/restaurant-market-intel-guard-ai-use-2026-06-29.md`
14. `Project-Reports/restaurant-approval-execution-packet-2026-06-29.md`
15. `Project-Reports/restaurant-scout-execution-packets-2026-06-29.md`
16. `Project-Reports/restaurant-scout-execution-packet-2026-06-29.md`
17. `Project-Reports/restaurant-deploy-approval-request.md`
18. `Project-Reports/restaurant-vercel-deployment-snapshot.md`
19. `Project-Reports/restaurant-hermes-deploy-signal-readiness.md`
20. `Project-Reports/restaurant-hermes-deploy-autopilot.md`
21. `Project-Reports/restaurant-hermes-post-approval-runbook.md`

## Current Gates

- Deploy requires: `APPROVE DEPLOY RESTAURANT AI ANSWERING ROUTE`
- After exact deploy approval, use `Project-Reports/restaurant-hermes-post-approval-runbook.md`.
- Route-pending no-link demand start requires one exact `APPROVE RESTAURANT SCOUT ...` phrase from the approval packet.
- Route-pending buyer replies require a matching exact `APPROVE RESTAURANT SCOUT BRIDGE: ...` phrase from the approval packet.
- Action-time posting/readback packet index is in `Project-Reports/restaurant-scout-execution-packets-2026-06-29.md`.
- The default phone-orders execution packet is in `Project-Reports/restaurant-scout-execution-packet-2026-06-29.md`; target-specific packets are listed in the index.
- Manual checkout fallback requires: `APPROVE RESTAURANT SCOUT MANUAL CHECKOUT: CONFIRMED FIT READY TO PAY`
- Paid diagnostic intake handoff requires: `APPROVE RESTAURANT PAID DIAGNOSTIC INTAKE HANDOFF`

## Hard Boundary

Do not deploy, post, DM, email, submit forms, send checkout links, call anyone,
or change billing without the exact current approval phrase. Local scripts and
vault exports are prepare-only unless explicitly approved.

## Truth Sources

- Payment truth: refresh `reports/gtm/stripe_readiness.md` from live Stripe before claiming revenue.
- Route truth: use `restaurant_ai_answering_route_preflight.py --live`.
- Fulfillment truth: use `restaurant-payment-fulfillment-readiness-2026-06-29.md`; if it says `waiting_for_payment`, do not start paid delivery.
- Buyer reply routing: use `restaurant-buyer-reply-router-2026-06-29.md` or run `restaurant_buyer_reply_router.py --reply ...` before choosing a bridge, close, or manual-checkout approval.
