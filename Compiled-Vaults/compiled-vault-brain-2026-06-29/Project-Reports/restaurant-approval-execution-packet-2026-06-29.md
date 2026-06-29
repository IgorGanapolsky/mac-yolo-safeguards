---
type: "approval-execution-packet"
project: "restaurant-ai-answering"
source_status: "local-export"
last_verified: "2026-06-29T13:54:46+00:00"
canonical_source: "reports/gtm/2026-06-29-money-today/restaurant-approval-execution-packet.md"
---
# Restaurant Approval Execution Packet

Generated: `2026-06-29T13:23:05+00:00`

Scope: local sequencing packet only. No deploy, Reddit post, DM, email, checkout creation, form submission, phone call, or payment action was executed.

- Status: `ready_for_operator_approval`
- Deploy live route ready: `false`
- Close packet status: `waiting_for_live_intake_or_deploy`
- Close ready: `false`
- Route-pending bridge replies ready: `4`
- Manual checkout fallbacks ready: `1`
- Manual checkout ready: `true`
- Close packet first-touch approval: `APPROVE RESTAURANT SCOUT PHONE ORDERS`
- Close packet target: `Phone Orders / Maple POS integration question`
- Close packet source guard: `reports/gtm/2026-06-29-money-today/restaurant-scout-guard.json`
- Post-approval runbook: `reports/gtm/hermes-post-approval-runbook.md`
- Paid fulfillment packet: `reports/gtm/2026-06-29-money-today/restaurant-paid-diagnostic-fulfillment.md`
- Paid fulfillment status: `fulfillment_assets_ready_waiting_for_payment`
- Payment fulfillment readiness: `reports/gtm/2026-06-29-money-today/restaurant-payment-fulfillment-readiness.md`
- Payment fulfillment status: `waiting_for_payment`
- Payment fulfillment snapshot fresh: `true`
- Payment fulfillment snapshot age seconds: `0`
- Payment fulfillment max snapshot age seconds: `900`
- Payment fulfillment captured today: `$0.00`
- Payment fulfillment successful charges today: `0`
- Estimated after-tax today: `$0.00`
- After-tax target: `$300.00`
- Gross still needed: `$428.58`
- Restaurant diagnostics needed: `1`
- One $499 diagnostic clears target: `true`
- Ready no-link restaurant starts: `5`

## Recommended Sequence

1. Approve deploy first if the goal is to send buyer traffic or close links.
2. After deploy approval, follow the Hermes post-approval runbook before treating any buyer path as live.
3. Approve one no-link restaurant scout at a time to start demand while deploy is pending.
4. Do not send payment or intake links in first-touch replies.
5. If a buyer asks for price, link, proof, or deliverables while the route is pending, use a route-pending bridge card generated for that same first-touch guard with exact approval.
6. Only send link-bearing close replies after buyer intent plus route/fallback readiness plus exact close approval.
7. If buyer intent is already qualified and they explicitly ask to pay, use the manual-checkout fallback only with exact manual checkout approval.
8. After verified payment, use the paid diagnostic fulfillment packet before promising implementation.
9. If payment fulfillment readiness says payment_detected_needs_fulfillment, verify the Stripe payment id/session id and move fulfillment ahead of new outreach.

## Payment Fulfillment Blockers

- no_499_restaurant_diagnostic_payment_detected_today
- no_successful_charge_detected_today

## Manual Checkout Requirements

- Buyer already replied with explicit payment intent or asked for checkout.
- Buyer supplied restaurant URL.
- Buyer supplied POS/menu surface.
- Buyer supplied the costly interaction path to map first.
- Buyer understands the 48-hour diagnostic uses those already-supplied details as the delivery brief.
- Live Stripe checkout URL is verified 200 in the current deploy approval request.
- Stripe/payment fulfillment readiness has been refreshed before sending any payment link.
- Operator supplied the exact manual-checkout approval keyword for the matching scenario.

## Approval Actions

| Order | Priority | Class | Status | Approval | Target | Rule |
|---:|---:|---|---|---|---|---|
| 1 | 100.0 | `deploy_prerequisite` | `prerequisite_approval` | `APPROVE DEPLOY RESTAURANT AI ANSWERING ROUTE` | Restaurant AI answering buyer route deploy readiness | Run only with exact approval. After deploy, verify the dedicated route, refresh restaurant fallback/close packets, refresh Hermes reports, and export the compiled vault. |
| 2 | 96.8 | `no_link_first_touch` | `ready_for_approval` | `APPROVE RESTAURANT SCOUT PHONE ORDERS` | Phone Orders / Maple POS integration question | Post only with exact approval and platform readback. The exact reply must stay question-first and contain no checkout/link. If the buyer asks for price, link, proof, deliverables, or fit after replying while close readiness is false, use only the matching route-pending bridge approval; do not send intake, checkout, demo, or payment links. |
| 3 | 95.9 | `no_link_first_touch` | `ready_for_approval` | `APPROVE RESTAURANT SCOUT TOAST MENU` | Embedding dynamic Toast menus on a website | Post only with exact approval and platform readback. The exact reply must stay question-first and contain no checkout/link. If the buyer asks for price, link, proof, deliverables, or fit after replying while close readiness is false, use only the matching route-pending bridge approval; do not send intake, checkout, demo, or payment links. |
| 4 | 95.2 | `no_link_first_touch` | `ready_for_approval` | `APPROVE RESTAURANT SCOUT AI USE OPS` | AI use in restaurants. | Post only with exact approval and platform readback. The exact reply must stay question-first and contain no checkout/link. If the buyer asks for price, link, proof, deliverables, or fit after replying while close readiness is false, use only the matching route-pending bridge approval; do not send intake, checkout, demo, or payment links. |
| 5 | 94.8 | `no_link_first_touch` | `ready_for_approval` | `APPROVE RESTAURANT SCOUT MISSED RESERVATIONS` | Using AI voice agents for expanding my business? | Post only with exact approval and platform readback. The exact reply must stay question-first and contain no checkout/link. If the buyer asks for price, link, proof, deliverables, or fit after replying while close readiness is false, use only the matching route-pending bridge approval; do not send intake, checkout, demo, or payment links. |
| 6 | 94.2 | `no_link_first_touch` | `ready_for_approval` | `APPROVE RESTAURANT SCOUT TOAST MARKETPLACE` | Small town delivery service routing marketplace orders into Toast POS | Post only with exact approval and platform readback. The exact reply must stay question-first and contain no checkout/link. If the buyer asks for price, link, proof, deliverables, or fit after replying while close readiness is false, use only the matching route-pending bridge approval; do not send intake, checkout, demo, or payment links. |

## Copy-Safe Approval Cards

### 1. Restaurant AI answering buyer route deploy readiness

- Class: `deploy_prerequisite`
- Priority: `100.0`
- Guard: `/Users/igorganapolsky/workspace/git/igor/skool_top1percent/reports/gtm/restaurant-deploy-approval-request.json`
- Use when: Use only when approving the production deploy prerequisite.
- After approval: Run the approved deploy command list from the deploy approval request, then follow reports/gtm/hermes-post-approval-runbook.md before sending buyer traffic.

```text
APPROVE DEPLOY RESTAURANT AI ANSWERING ROUTE
```

### 2. Phone Orders / Maple POS integration question

- Class: `no_link_first_touch`
- Priority: `96.8`
- Guard: `/Users/igorganapolsky/workspace/git/igor/skool_top1percent/reports/gtm/2026-06-29-money-today/restaurant-scout-guard.json`
- Use when: Use only when approving this specific no-link public restaurant first touch.
- After approval: Post only the exact reply from the guard packet, verify platform readback, and do not include links.

```text
APPROVE RESTAURANT SCOUT PHONE ORDERS
```

Exact reply text:

```text
I would not start with a full AI order taker. For phone orders, the risk is usually menu modifiers, payment capture, and what the agent is allowed to confirm without a human.

If Maple is the only POS-integrated option you found, I would first map four things: POS/menu modifier rules, what payment or reservation actions are allowed, which exceptions staff must approve, and what summary the manager gets after each call.

Which part is costing you more right now: missed calls, long call times, or incorrect orders?
```

### 3. Embedding dynamic Toast menus on a website

- Class: `no_link_first_touch`
- Priority: `95.9`
- Guard: `/Users/igorganapolsky/workspace/git/igor/skool_top1percent/reports/gtm/2026-06-29-money-today/restaurant-scout-guard-toast-menu.json`
- Use when: Use only when approving this specific no-link public restaurant first touch.
- After approval: Post only the exact reply from the guard packet, verify platform readback, and do not include links.

```text
APPROVE RESTAURANT SCOUT TOAST MENU
```

Exact reply text:

```text
I would be careful about treating the Toast menu as just an embed problem. The hard part is usually which menu source is authoritative, how modifiers stay current, and what happens when online ordering or reservations need to hand off to staff.

Before building around the API, I would map three paths: public menu display, order/reservation handoff, and manager exception review.

Are you trying to reduce manual menu updates, route more online orders, or keep reservations/menu data in sync?
```

### 4. AI use in restaurants.

- Class: `no_link_first_touch`
- Priority: `95.2`
- Guard: `/Users/igorganapolsky/workspace/git/igor/skool_top1percent/reports/gtm/2026-06-29-money-today/restaurant-market-intel-guard-ai-use.json`
- Use when: Use only when approving this specific no-link public restaurant first touch.
- After approval: Post only the exact reply from the guard packet, verify platform readback, and do not include links.

```text
APPROVE RESTAURANT SCOUT AI USE OPS
```

Exact reply text:

```text
I would split this into workflow triage before picking a tool. The useful restaurant AI cases usually fall into four buckets: missed phone calls, invoice variance, inventory ordering, and staff handoff.

The risk is letting AI confirm something staff should approve. I would first map what it can draft, what a manager must approve, and what gets measured weekly.

If you could only map one workflow this week, which one is costing the most: missed calls, invoice cleanup, inventory reordering, or manager handoff?
```

### 5. Using AI voice agents for expanding my business?

- Class: `no_link_first_touch`
- Priority: `94.8`
- Guard: `/Users/igorganapolsky/workspace/git/igor/skool_top1percent/reports/gtm/2026-06-29-money-today/restaurant-scout-guard-missed-reservations.json`
- Use when: Use only when approving this specific no-link public restaurant first touch.
- After approval: Post only the exact reply from the guard packet, verify platform readback, and do not include links.

```text
APPROVE RESTAURANT SCOUT MISSED RESERVATIONS
```

Exact reply text:

```text
For that use case I would start smaller than a general AI voice agent. Missed reservation calls need a clear policy for party size, time windows, deposits, and when a human has to confirm.

The first map should be call capture, reservation-system handoff, staff approval rules, and the summary the manager sees after dinner rush.

Are the missed calls mostly reservation requests, menu questions, or people changing existing bookings?
```

### 6. Small town delivery service routing marketplace orders into Toast POS

- Class: `no_link_first_touch`
- Priority: `94.2`
- Guard: `/Users/igorganapolsky/workspace/git/igor/skool_top1percent/reports/gtm/2026-06-29-money-today/restaurant-scout-guard-toast-marketplace.json`
- Use when: Use only when approving this specific no-link public restaurant first touch.
- After approval: Post only the exact reply from the guard packet, verify platform readback, and do not include links.

```text
APPROVE RESTAURANT SCOUT TOAST MARKETPLACE
```

Exact reply text:

```text
I would map the order handoff before touching webhooks. For Toast marketplace routing, the risky parts are modifiers, customer/contact fields, kitchen routing, failed pushes, and what staff sees when the order cannot be inserted cleanly.

A safe first version should prove one order source, one menu slice, and one exception queue before scaling.

Are you blocked more by Toast API access, modifier mapping, or kitchen/staff exception handling?
```

## Route-Pending Bridge Cards

These bridge cards apply only to the close-packet first-touch guard shown in the summary above.
If the buyer replied to a different restaurant scout target, regenerate `restaurant_scout_close_packet.py --guard <matching guard json>` before using a bridge approval.

### ASKED PRICE

Use only after the buyer replies with this specific intent while the restaurant route or intake fallback is not live. Bridge text must contain no URLs or checkout links.

```text
APPROVE RESTAURANT SCOUT BRIDGE: ASKED PRICE
```

Exact reply text:

```text
The diagnostic is $499, but I would not send you to checkout until the restaurant path is live and the fit is real.

For your case, the paid map is only worth it if there is a concrete leak: missed calls, long call times, modifier mistakes, payment/reservation uncertainty, or manager handoff gaps.

Send the restaurant URL, POS/menu surface, and which phone-order path is costing the most. I will tell you if it is worth the diagnostic or if you should skip it.
```

### ASKED FOR LINK

Use only after the buyer replies with this specific intent while the restaurant route or intake fallback is not live. Bridge text must contain no URLs or checkout links.

```text
APPROVE RESTAURANT SCOUT BRIDGE: ASKED FOR LINK
```

Exact reply text:

```text
I am not going to drop a checkout link into the thread cold.

Send three details first: restaurant URL, POS/menu surface, and the phone-order path that is leaking. If it is a fit, the diagnostic maps the safe first workflow, approval gate, failure guardrails, and smallest measurable pilot.
```

### ASKED WHAT THEY GET

Use only after the buyer replies with this specific intent while the restaurant route or intake fallback is not live. Bridge text must contain no URLs or checkout links.

```text
APPROVE RESTAURANT SCOUT BRIDGE: ASKED WHAT THEY GET
```

Exact reply text:

```text
You get a 48-hour map for the first safe restaurant answering workflow: call path, POS/menu surface, what the agent may draft, what staff must approve, failure guardrails, and the smallest measurable pilot.

To tell if it is worth paying for, I need the restaurant URL, POS/menu surface, and the one interaction path that is costing money right now.
```

### ASKED FOR PROOF

Use only after the buyer replies with this specific intent while the restaurant route or intake fallback is not live. Bridge text must contain no URLs or checkout links.

```text
APPROVE RESTAURANT SCOUT BRIDGE: ASKED FOR PROOF
```

Exact reply text:

```text
The proof I would use for your case is a small map, not a generic AI demo: one order or booking path, POS/menu surface, staff approval rule, failure case, and manager summary.

Send the restaurant URL and the specific path you want handled first. I will tell you whether it is a fit for the paid diagnostic before any checkout link.
```

## Manual Checkout Fallback Cards

These manual-checkout cards apply only to the close-packet first-touch guard shown in the summary above.
If the qualified buyer came from a different restaurant scout target, regenerate the close packet with that target's guard before sending a checkout link.

### CONFIRMED FIT READY TO PAY

Use only after qualified buyer intent, restaurant URL, POS/menu surface, costly interaction path, and exact manual checkout approval.

```text
APPROVE RESTAURANT SCOUT MANUAL CHECKOUT: CONFIRMED FIT READY TO PAY
```

Exact reply text:

```text
Yes. Based on the restaurant URL, POS/menu surface, and the leak you described, this is a fit for the $499 diagnostic.

Pay here when ready:
https://buy.stripe.com/eVq28rfCY0aOdWh5e33sI0N

After payment, I will use the restaurant URL, POS/menu surface, and phone-order path you already sent to deliver the 48-hour workflow map: approval gate, guardrails, failure cases, and smallest measurable pilot.
```

## Approved Deploy Command

- `cd /Users/igorganapolsky/workspace/git/igor/skool_top1percent`
- `python3 scripts/revenue_ops/deploy_restaurant_ai_answering_route.py --approval "APPROVE DEPLOY RESTAURANT AI ANSWERING ROUTE"`
