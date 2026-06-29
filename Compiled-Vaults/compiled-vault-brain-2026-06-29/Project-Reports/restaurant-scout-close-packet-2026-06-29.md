---
type: "close-reply-packet"
project: "restaurant-ai-answering"
source_status: "local-export"
last_verified: "2026-06-29T08:01:01+00:00"
canonical_source: "reports/gtm/2026-06-29-money-today/restaurant-scout-close-packet.md"
---
# Restaurant Scout Close Packet

Generated: `2026-06-29T07:48:18+00:00`

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

## Rule

Do not send a link-bearing close reply until the buyer replies with intent, the matching close approval is provided, and either live_intake_fallback_ready is true or the dedicated restaurant route has been deployed and verified.

## Route-Pending Bridge Rule

If the buyer asks for price, link, proof, or deliverables before live route readiness, use only a matching bridge approval. Bridge replies must contain no URLs, checkout links, intake links, payment links, phone-number asks, or promise of implementation.

## Route-Pending Bridge Replies

### ASKED PRICE

Approval:

```text
APPROVE RESTAURANT SCOUT BRIDGE: ASKED PRICE
```

Exact text:

```text
The diagnostic is $499, but I would not send you to checkout until the restaurant path is live and the fit is real.

For your case, the paid map is only worth it if there is a concrete leak: missed calls, long phone-order time, modifier mistakes, payment/reservation uncertainty, or manager handoff gaps.

Send the restaurant URL, POS/menu surface, and which of those is costing the most. I will tell you if it is worth the diagnostic or if you should skip it.
```

### ASKED FOR LINK

Approval:

```text
APPROVE RESTAURANT SCOUT BRIDGE: ASKED FOR LINK
```

Exact text:

```text
I am not going to drop a checkout link into the thread cold.

Send three details first: restaurant URL, POS/menu surface, and the phone-order or booking path that is leaking. If it is a fit, the diagnostic maps the safe first workflow, approval gate, failure guardrails, and smallest measurable pilot.
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

### ASKED PRICE

Approval:

```text
APPROVE RESTAURANT SCOUT CLOSE: ASKED PRICE
```

Exact text:

```text
The diagnostic is $499.

For phone orders, I would only use it if there is a real operational leak: missed calls, long call times, modifier mistakes, payment/reservation uncertainty, or manager handoff gaps.

If you want me to sanity-check fit before you pay, use this fit-check path first:
https://site-gamma-one-15.vercel.app/speed-to-lead?source=reddit_restaurant_phone_orders&offer=restaurant_diagnostic#fit-check

If you already know the leak is real, use the intake path here:
https://site-gamma-one-15.vercel.app/start-speed-to-lead?source=reddit_restaurant_phone_orders&offer=restaurant_diagnostic
```

### ASKED FOR LINK

Approval:

```text
APPROVE RESTAURANT SCOUT CLOSE: ASKED FOR LINK
```

Exact text:

```text
Yes. Start here so I get the restaurant/POS context before checkout:

https://site-gamma-one-15.vercel.app/start-speed-to-lead?source=reddit_restaurant_phone_orders&offer=restaurant_diagnostic

Use one restaurant, one phone-order path, and the POS/menu surface you are considering. I will map the safe first workflow, approval gate, and smallest pilot.
```

### ASKED WHAT THEY GET

Approval:

```text
APPROVE RESTAURANT SCOUT CLOSE: ASKED WHAT THEY GET
```

Exact text:

```text
You get a 48-hour map for the first safe restaurant answering workflow: call path, POS/menu surface, what the agent may draft, what staff must approve, failure guardrails, and the smallest measurable pilot.

For your thread, I would focus on phone orders first: menu modifiers, payment/reservations, exception handling, and manager summaries.

If you want a fit check before paying, use this path:
https://site-gamma-one-15.vercel.app/speed-to-lead?source=reddit_restaurant_phone_orders&offer=restaurant_diagnostic#fit-check
```

### CONFIRMED POS FIT

Approval:

```text
APPROVE RESTAURANT SCOUT CLOSE: CONFIRMED POS FIT
```

Exact text:

```text
That is enough to map the first workflow.

Send the restaurant URL, POS/menu surface, and the one phone-order action you want handled first. I will turn it into the diagnostic map: integration path, approval gate, guardrails, and smallest paid pilot.

https://site-gamma-one-15.vercel.app/start-speed-to-lead?source=reddit_restaurant_phone_orders&offer=restaurant_diagnostic
```

### ASKED FOR PROOF

Approval:

```text
APPROVE RESTAURANT SCOUT CLOSE: ASKED FOR PROOF
```

Exact text:

```text
Here is the public preview repo: https://github.com/IgorGanapolsky/qsr-ai-preview

The useful part is the POS compatibility map: it ranks order exports, customer/contact exports, inventory, reviews, shift notes, and missed-call/DM/SMS surfaces by safest first workflow.

If you want me to map your specific phone-order path, use the fit-check first:
https://site-gamma-one-15.vercel.app/speed-to-lead?source=reddit_restaurant_phone_orders&offer=restaurant_diagnostic#fit-check
```

### NO BUDGET

Approval:

```text
APPROVE RESTAURANT SCOUT CLOSE: NO BUDGET
```

Exact text:

```text
Totally fair. I would not buy implementation before the leak is proven.

The free test: track 20 phone orders and mark how many had long decision time, missing modifiers, payment/reservation uncertainty, or staff rework. If that number is meaningful, then a diagnostic makes sense.

If you want a yes/no before paying, use this fit-check path:
https://site-gamma-one-15.vercel.app/speed-to-lead?source=reddit_restaurant_phone_orders&offer=restaurant_diagnostic#fit-check
```
