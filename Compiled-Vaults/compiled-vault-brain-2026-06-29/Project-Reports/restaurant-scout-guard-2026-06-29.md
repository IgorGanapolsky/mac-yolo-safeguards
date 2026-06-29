---
type: "approval-guard"
project: "restaurant-ai-answering"
source_status: "local-export"
last_verified: "2026-06-29T08:01:01+00:00"
canonical_source: "reports/gtm/2026-06-29-money-today/restaurant-scout-guard.md"
---
# Restaurant Scout Guard

Generated: `2026-06-29T07:40:46+00:00`

Scope: approval packet only. No Reddit post, DM, email, checkout send, deploy, form submission, phone call, or payment action was executed.

- Status: `ready_for_approval`
- Allowed after exact approval: `true`
- Approval keyword: `APPROVE RESTAURANT SCOUT PHONE ORDERS`
- Target: Phone Orders / Maple POS integration question
- Thread: `https://www.reddit.com/r/restaurantowners/comments/1q2ke7k/phone_orders/`
- Readback URL: `https://old.reddit.com/r/restaurantowners/comments/1q2ke7k/phone_orders/`
- Readback status: `200`
- Readback required terms matched: `phone, orders, maple, pos`
- Duplicate hits: `0`
- Revenue route for confirmed interest only: `https://site-gamma-one-15.vercel.app/start-speed-to-lead?source=reddit_restaurant_phone_orders&offer=restaurant_diagnostic`

## Exact Reply

```text
I would not start with a full AI order taker. For phone orders, the risk is usually menu modifiers, payment capture, and what the agent is allowed to confirm without a human.

If Maple is the only POS-integrated option you found, I would first map four things: POS/menu modifier rules, what payment or reservation actions are allowed, which exceptions staff must approve, and what summary the manager gets after each call.

Which part is costing you more right now: missed calls, long call times, or incorrect orders?
```

## Reasons

- safe question-first Reddit reply; no checkout link; live readback and duplicate checks passed

## Execution Rule

Do not post unless the operator provides exact action-time approval: `APPROVE RESTAURANT SCOUT PHONE ORDERS`.
