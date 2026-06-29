---
type: "approval-guard"
project: "restaurant-ai-answering"
source_status: "local-export"
last_verified: "2026-06-29T13:51:03+00:00"
canonical_source: "reports/gtm/2026-06-29-money-today/restaurant-scout-guard-toast-marketplace.md"
---
# Restaurant Scout Guard

Generated: `2026-06-29T09:56:10+00:00`

Scope: approval packet only. No Reddit post, DM, email, checkout send, deploy, form submission, phone call, or payment action was executed.

- Status: `ready_for_approval`
- Allowed after exact approval: `true`
- Approval keyword: `APPROVE RESTAURANT SCOUT TOAST MARKETPLACE`
- Target: Small town delivery service routing marketplace orders into Toast POS
- Thread: `https://www.reddit.com/r/ToastPOS/comments/1m6crv8/small_town_delivery_service_looking_to_have_my/`
- Readback URL: `https://old.reddit.com/r/ToastPOS/comments/1m6crv8/small_town_delivery_service_looking_to_have_my/`
- Readback status: `200`
- Readback required terms matched: `toast, orders`
- Duplicate hits: `0`
- Revenue route for confirmed interest only: `https://site-gamma-one-15.vercel.app/start-speed-to-lead?source=reddit_restaurant_toast_marketplace&offer=restaurant_diagnostic`

## Exact Reply

```text
I would map the order handoff before touching webhooks. For Toast marketplace routing, the risky parts are modifiers, customer/contact fields, kitchen routing, failed pushes, and what staff sees when the order cannot be inserted cleanly.

A safe first version should prove one order source, one menu slice, and one exception queue before scaling.

Are you blocked more by Toast API access, modifier mapping, or kitchen/staff exception handling?
```

## Reasons

- safe question-first Reddit reply; no checkout link; live readback and duplicate checks passed

## Execution Rule

Do not post unless the operator provides exact action-time approval: `APPROVE RESTAURANT SCOUT TOAST MARKETPLACE`.
