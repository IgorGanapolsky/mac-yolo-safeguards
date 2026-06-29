---
type: "scout-execution-packet"
project: "restaurant-ai-answering"
source_status: "local-export"
last_verified: "2026-06-29T13:54:46+00:00"
canonical_source: "reports/gtm/2026-06-29-money-today/restaurant-scout-execution-packet.md"
---
# Restaurant Scout Execution Packet

Generated: `2026-06-29T11:18:33+00:00`

Scope: local action-time packet only. No Reddit post, DM, email, deploy, form submission, checkout, phone call, or payment action was executed.

- Status: `ready_for_exact_approval`
- Approval required: `APPROVE RESTAURANT SCOUT PHONE ORDERS`
- Target: Phone Orders / Maple POS integration question
- Channel: `reddit_restaurantowners`
- Thread URL: `https://www.reddit.com/r/restaurantowners/comments/1q2ke7k/phone_orders/`
- Guard: `reports/gtm/2026-06-29-money-today/restaurant-scout-guard.json`
- Guard status: `ready_for_approval`
- Guard allowed: `true`

## Exact Approval

```text
APPROVE RESTAURANT SCOUT PHONE ORDERS
```

## Exact Reply

```text
I would not start with a full AI order taker. For phone orders, the risk is usually menu modifiers, payment capture, and what the agent is allowed to confirm without a human.

If Maple is the only POS-integrated option you found, I would first map four things: POS/menu modifier rules, what payment or reservation actions are allowed, which exceptions staff must approve, and what summary the manager gets after each call.

Which part is costing you more right now: missed calls, long call times, or incorrect orders?
```

## Pre-Execution Checks

1. Confirm the operator supplied the exact approval keyword in this packet.
2. Reload or freshly open the source thread before posting.
3. Confirm the source post/comment is still visible and relevant.
4. Confirm no duplicate Igor reply already exists on the thread.
5. Confirm the reply editor and submit button are enabled before interacting.
6. Post only exact_text_to_execute; do not add payment, checkout, intake, demo, or phone links.

## Post-Execution Readback

1. Reload the page after submission before final verification.
2. Verify the reply text only inside static read-only comment/post containers.
3. Exclude editor inputs, textareas, contenteditable elements, and form inputs from the verification scope.
4. Confirm the visible comment/reply count increased by exactly 1.
5. Record the platform permalink or static container evidence before updating any ledger.
6. Update any ledger only after platform readback proves persistence.

## Browser Automation Guardrails

- Do not click disabled controls, controls with a disabled attribute, or controls with aria-disabled="true".
- No contacted/post-sent ledger update until post-reload static readback and count +1 are verified.

## Source Readback Before Packet

- Status code: `200`
- OK: `true`
- Matched terms: `phone, orders, maple, pos`
