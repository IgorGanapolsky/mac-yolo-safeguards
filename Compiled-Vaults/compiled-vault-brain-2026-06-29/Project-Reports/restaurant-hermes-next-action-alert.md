---
type: "operator-alert"
project: "restaurant-ai-answering"
source_status: "local-export"
last_verified: "2026-06-29T13:54:46+00:00"
canonical_source: "reports/gtm/hermes-next-action-alert.txt"
---
[Hermes Next-Dollar Action]

Score: 78.5/100
Captured: $0.00
Hermes active operator: hermes_telegram
Duplicate risk: false

Approval keyword: APPROVE DEPLOY RESTAURANT AI ANSWERING ROUTE
Target: Restaurant AI answering buyer route deploy readiness
Thread: https://site-gamma-one-15.vercel.app/restaurant-ai-answering
Guard: /Users/igorganapolsky/workspace/git/igor/skool_top1percent/reports/gtm/restaurant-deploy-approval-request.json

Readiness:
- action type: approval_gated_restaurant_deploy
- approval cards: 6
- post-approval runbooks: 1
- live intake source context: false
- live critical intake: false
- live triage fit-check fallback: false
- intake URLs live: true

Exact card to present:
Action-time approval needed: APPROVE DEPLOY RESTAURANT AI ANSWERING ROUTE

Target: Restaurant AI answering buyer route deploy readiness
Thread: https://site-gamma-one-15.vercel.app/restaurant-ai-answering

If approved, Hermes/Codex may run this approval-gated deploy path:

Local buyer route is ready, but the live restaurant route and restaurant intake fallback are stale.

Current deploy evidence:
- local_ready=True
- dry_run_ready=True
- dry_run_returncode=0
- live_route_ready=False
- live_checkout_ready=True

After approval, verify:
- approved_deploy_runner: command exits 0 after Vercel deploy, live route verification, artifact refresh, and compiled-vault verification
- live_route_200: live_restaurant_route_200, live_llms_lists_route, live_sitemap_lists_route, and live_restaurant_checkout_200 all PASS
- live_intake_or_close_path: scout execution, close, and checkout recovery packets are refreshed from the current approved guard, and close packet becomes ready from either verified dedicated route or verified live restaurant intake fallback
- payment_truth: Stripe remains production_ready=true; captured today is reported from live Stripe truth
- agent_handoff: Hermes queue, approval request, post-approval runbook, next-action alert, payment fulfillment readiness, manual checkout readiness, buyer reply router, coordination packet, and verified centralized vault reflect the deployed restaurant route

Approved execution bundle:
python3 scripts/revenue_ops/deploy_restaurant_ai_answering_route.py --approval "APPROVE DEPLOY RESTAURANT AI ANSWERING ROUTE"

Reply exactly APPROVE DEPLOY RESTAURANT AI ANSWERING ROUTE to approve this one action.

Restaurant execution state:

- live route ready: false
- no-link starts ready: 5
- close ready: false
- paid fulfillment assets: fulfillment_assets_ready_waiting_for_payment
- payment fulfillment: waiting_for_payment
- payment snapshot fresh: true
- payment snapshot age seconds: 0
- payment captured today: $0.00
- payment successful charges today: 0
- manual checkout fallbacks: 1
- manual checkout ready: true
- route-pending bridge replies: 4
- estimated after-tax today: $0.00
- after-tax target: $300.00
- gross still needed: $428.58
- restaurant diagnostics needed: 1
- one $499 diagnostic clears target: true

Payment fulfillment blockers:
- no_499_restaurant_diagnostic_payment_detected_today
- no_successful_charge_detected_today

Restaurant scout execution packet index:

Artifact: reports/gtm/2026-06-29-money-today/restaurant-scout-execution-packets.md
Ready no-link packets: 5
Use exactly one matching packet after exact approval; verify post-reload static readback and count +1 before ledger updates.

Approval menu:
- APPROVE RESTAURANT SCOUT PHONE ORDERS
- APPROVE RESTAURANT SCOUT TOAST MENU
- APPROVE RESTAURANT SCOUT AI USE OPS
- APPROVE RESTAURANT SCOUT MISSED RESERVATIONS
- APPROVE RESTAURANT SCOUT TOAST MARKETPLACE

Route-pending demand start option:

This is a no-link first touch. It does not include checkout, intake, payment, phone, or demo URLs.

Approval keyword: APPROVE RESTAURANT SCOUT PHONE ORDERS
Target: Phone Orders / Maple POS integration question
Guard: /Users/igorganapolsky/workspace/git/igor/skool_top1percent/reports/gtm/2026-06-29-money-today/restaurant-scout-guard.json

Exact no-link reply if approved:
I would not start with a full AI order taker. For phone orders, the risk is usually menu modifiers, payment capture, and what the agent is allowed to confirm without a human.

If Maple is the only POS-integrated option you found, I would first map four things: POS/menu modifier rules, what payment or reservation actions are allowed, which exceptions staff must approve, and what summary the manager gets after each call.

Which part is costing you more right now: missed calls, long call times, or incorrect orders?

Route-pending buyer-reply bridge option:

Use only after a buyer replies with the matching intent while the restaurant route or intake fallback is not live. This bridge contains no URLs or checkout links.

Approval keyword: APPROVE RESTAURANT SCOUT BRIDGE: ASKED PRICE
Scenario: ASKED PRICE

Exact bridge reply if approved:
The diagnostic is $499, but I would not send you to checkout until the restaurant path is live and the fit is real.

For your case, the paid map is only worth it if there is a concrete leak: missed calls, long call times, modifier mistakes, payment/reservation uncertainty, or manager handoff gaps.

Send the restaurant URL, POS/menu surface, and which phone-order path is costing the most. I will tell you if it is worth the diagnostic or if you should skip it.

Qualified manual checkout option:

Use only after the buyer has already supplied restaurant URL, POS/menu surface, the costly interaction path, and explicitly asks to pay or requests checkout.

Manual checkout requirements:
- Buyer already replied with explicit payment intent or asked for checkout.
- Buyer supplied restaurant URL.
- Buyer supplied POS/menu surface.
- Buyer supplied the costly interaction path to map first.
- Buyer understands the 48-hour diagnostic uses those already-supplied details as the delivery brief.
- Live Stripe checkout URL is verified 200 in the current deploy approval request.
- Stripe/payment fulfillment readiness has been refreshed before sending any payment link.
- Operator supplied the exact manual-checkout approval keyword for the matching scenario.

Approval keyword: APPROVE RESTAURANT SCOUT MANUAL CHECKOUT: CONFIRMED FIT READY TO PAY
Scenario: CONFIRMED FIT READY TO PAY

Exact payment reply if approved:
Yes. Based on the restaurant URL, POS/menu surface, and the leak you described, this is a fit for the $499 diagnostic.

Pay here when ready:
https://buy.stripe.com/eVq28rfCY0aOdWh5e33sI0N

After payment, I will use the restaurant URL, POS/menu surface, and phone-order path you already sent to deliver the 48-hour workflow map: approval gate, guardrails, failure cases, and smallest measurable pilot.

Buyer reply router:

Use this local classifier after a real restaurant buyer reply before choosing a bridge, close, checkout, or fulfillment approval.

Artifact: reports/gtm/2026-06-29-money-today/restaurant-buyer-reply-router.md
Command: python3 scripts/revenue_ops/restaurant_buyer_reply_router.py --reply "<buyer reply>"
Current classification: no_buyer_reply_supplied
Current status: waiting_for_buyer_reply
Current approval: none

Missing manual checkout requirements:
- explicit_payment_intent_or_checkout_request
- restaurant_url
- pos_or_menu_surface
- costly_interaction_path

No buyer reply is currently supplied; do not send a bridge, checkout link, or close reply from this router state.
