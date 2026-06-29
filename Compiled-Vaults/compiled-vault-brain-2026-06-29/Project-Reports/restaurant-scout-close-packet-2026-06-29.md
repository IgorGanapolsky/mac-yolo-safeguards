---
type: "close-reply-packet"
project: "restaurant-ai-answering"
source_status: "local-export"
last_verified: "2026-06-29T13:54:46+00:00"
canonical_source: "reports/gtm/2026-06-29-money-today/restaurant-scout-close-packet.md"
---
# Restaurant Scout Close Packet

Generated: `2026-06-29T13:21:18+00:00`

Scope: local close-reply packet only. No Reddit post, DM, email, checkout send, deploy, form submission, phone call, or payment action was executed.

- Status: `waiting_for_live_intake_or_deploy`
- First-touch approval keyword: `APPROVE RESTAURANT SCOUT PHONE ORDERS`
- Target: Phone Orders / Maple POS integration question
- Thread: `https://www.reddit.com/r/restaurantowners/comments/1q2ke7k/phone_orders/`
- Close offer: `restaurant_diagnostic`
- Live restaurant route ready: `false`
- Live restaurant route status: `waiting_for_exact_deploy_approval`
- Live intake fallback ready: `false`
- Live intake fallback status: `not_ready`
- Intake URL: `https://site-gamma-one-15.vercel.app/start-speed-to-lead?source=reddit_restaurant_phone_orders&offer=restaurant_diagnostic`
- Fit-check URL: `https://site-gamma-one-15.vercel.app/speed-to-lead?source=reddit_restaurant_phone_orders&offer=restaurant_diagnostic#fit-check`
- Live checkout ready: `true`
- Manual checkout ready: `true`

## Rule

Do not send a link-bearing close reply until the buyer replies with intent, the matching close approval is provided, and either live_intake_fallback_ready is true or the dedicated restaurant route has been deployed and verified.

## Route-Pending Bridge Rule

If the buyer asks for price, link, proof, or deliverables before live route readiness, use only a matching bridge approval. Bridge replies must contain no URLs, checkout links, intake links, payment links, phone-number asks, or promise of implementation.

## Manual Checkout Fallback Rule

If the buyer has already supplied restaurant URL, POS/menu surface, and the costly interaction path, and explicitly says they want to pay or asks for checkout, a matching manual-checkout approval may use the verified Stripe checkout directly even while the intake route is stale. Do not use this for cold first touches.

## Manual Checkout Requirements

- Buyer already replied with explicit payment intent or asked for checkout.
- Buyer supplied restaurant URL.
- Buyer supplied POS/menu surface.
- Buyer supplied the costly interaction path to map first.
- Buyer understands the 48-hour diagnostic uses those already-supplied details as the delivery brief.
- Live Stripe checkout URL is verified 200 in the current deploy approval request.
- Stripe/payment fulfillment readiness has been refreshed before sending any payment link.
- Operator supplied the exact manual-checkout approval keyword for the matching scenario.
## Manual Checkout Fallback Replies

### CONFIRMED FIT READY TO PAY

Approval:

```text
APPROVE RESTAURANT SCOUT MANUAL CHECKOUT: CONFIRMED FIT READY TO PAY
```

Exact text:

```text
Yes. Based on the restaurant URL, POS/menu surface, and the leak you described, this is a fit for the $499 diagnostic.

Pay here when ready:
https://buy.stripe.com/eVq28rfCY0aOdWh5e33sI0N

After payment, I will use the restaurant URL, POS/menu surface, and phone-order path you already sent to deliver the 48-hour workflow map: approval gate, guardrails, failure cases, and smallest measurable pilot.
```

## Route-Pending Bridge Replies

### ASKED PRICE

Approval:

```text
APPROVE RESTAURANT SCOUT BRIDGE: ASKED PRICE
```

Exact text:

```text
The diagnostic is $499, but I would not send you to checkout until the restaurant path is live and the fit is real.

For your case, the paid map is only worth it if there is a concrete leak: missed calls, long call times, modifier mistakes, payment/reservation uncertainty, or manager handoff gaps.

Send the restaurant URL, POS/menu surface, and which phone-order path is costing the most. I will tell you if it is worth the diagnostic or if you should skip it.
```

### ASKED FOR LINK

Approval:

```text
APPROVE RESTAURANT SCOUT BRIDGE: ASKED FOR LINK
```

Exact text:

```text
I am not going to drop a checkout link into the thread cold.

Send three details first: restaurant URL, POS/menu surface, and the phone-order path that is leaking. If it is a fit, the diagnostic maps the safe first workflow, approval gate, failure guardrails, and smallest measurable pilot.
```

### ASKED WHAT THEY GET

Approval:

```text
APPROVE RESTAURANT SCOUT BRIDGE: ASKED WHAT THEY GET
```

Exact text:

```text
You get a 48-hour map for the first safe restaurant answering workflow: call path, POS/menu surface, what the agent may draft, what staff must approve, failure guardrails, and the smallest measurable pilot.

To tell if it is worth paying for, I need the restaurant URL, POS/menu surface, and the one interaction path that is costing money right now.
```

### ASKED FOR PROOF

Approval:

```text
APPROVE RESTAURANT SCOUT BRIDGE: ASKED FOR PROOF
```

Exact text:

```text
The proof I would use for your case is a small map, not a generic AI demo: one order or booking path, POS/menu surface, staff approval rule, failure case, and manager summary.

Send the restaurant URL and the specific path you want handled first. I will tell you whether it is a fit for the paid diagnostic before any checkout link.
```

## Scenario Replies

Suppressed while live restaurant route and live intake fallback are not verified.
Use only Route-Pending Bridge Replies or the qualified Manual Checkout Fallback path above.
