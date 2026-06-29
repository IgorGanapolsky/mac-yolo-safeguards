---
type: "approval-execution-packet"
project: "restaurant-ai-answering"
source_status: "local-export"
last_verified: "2026-06-29T08:01:01+00:00"
canonical_source: "reports/gtm/2026-06-29-money-today/restaurant-approval-execution-packet.md"
---
# Restaurant Approval Execution Packet

Generated: `2026-06-29T08:01:01+00:00`

Scope: local sequencing packet only. No deploy, Reddit post, DM, email, checkout creation, form submission, phone call, or payment action was executed.

- Status: `ready_for_operator_approval`
- Deploy live route ready: `false`
- Close packet status: `waiting_for_live_intake_or_deploy`
- Close ready: `false`
- Ready no-link restaurant starts: `4`

## Recommended Sequence

1. Approve deploy first if the goal is to send buyer traffic or close links.
2. Approve one no-link restaurant scout at a time to start demand while deploy is pending.
3. Do not send payment or intake links in first-touch replies.
4. Only send link-bearing close replies after buyer intent plus route/fallback readiness plus exact close approval.

## Approval Actions

| Order | Class | Status | Approval | Target | Rule |
|---:|---|---|---|---|---|
| 1 | `deploy_prerequisite` | `prerequisite_approval` | `APPROVE DEPLOY RESTAURANT AI ANSWERING ROUTE` | Restaurant AI answering buyer route deploy readiness | Run only with exact approval. After deploy, verify the dedicated route, refresh restaurant fallback/close packets, refresh Hermes reports, and export the compiled vault. |
| 2 | `no_link_first_touch` | `ready_for_approval` | `APPROVE RESTAURANT SCOUT PHONE ORDERS` | Phone Orders / Maple POS integration question | Post only with exact approval and platform readback. The exact reply must stay question-first and contain no checkout/link. If the buyer asks for price, link, proof, or fit after replying, use the close packet only when close readiness is true. |
| 3 | `no_link_first_touch` | `ready_for_approval` | `APPROVE RESTAURANT SCOUT TOAST MENU` | Embedding dynamic Toast menus on a website | Post only with exact approval and platform readback. The exact reply must stay question-first and contain no checkout/link. If the buyer asks for price, link, proof, or fit after replying, use the close packet only when close readiness is true. |
| 4 | `no_link_first_touch` | `ready_for_approval` | `APPROVE RESTAURANT SCOUT MISSED RESERVATIONS` | Using AI voice agents for expanding my business? | Post only with exact approval and platform readback. The exact reply must stay question-first and contain no checkout/link. If the buyer asks for price, link, proof, or fit after replying, use the close packet only when close readiness is true. |
| 5 | `no_link_first_touch` | `ready_for_approval` | `APPROVE RESTAURANT SCOUT TOAST MARKETPLACE` | Small town delivery service routing marketplace orders into Toast POS | Post only with exact approval and platform readback. The exact reply must stay question-first and contain no checkout/link. If the buyer asks for price, link, proof, or fit after replying, use the close packet only when close readiness is true. |

## Copy-Safe Approval Cards

### 1. Restaurant AI answering buyer route deploy readiness

- Class: `deploy_prerequisite`
- Guard: `/Users/igorganapolsky/workspace/git/igor/skool_top1percent/reports/gtm/restaurant-deploy-approval-request.json`
- Use when: Use only when approving the production deploy prerequisite.
- After approval: Run the approved deploy command list from the deploy approval request, then rerun live verification.

```text
APPROVE DEPLOY RESTAURANT AI ANSWERING ROUTE
```

### 2. Phone Orders / Maple POS integration question

- Class: `no_link_first_touch`
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

### 4. Using AI voice agents for expanding my business?

- Class: `no_link_first_touch`
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

### 5. Small town delivery service routing marketplace orders into Toast POS

- Class: `no_link_first_touch`
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

## Approved Deploy Command

- `cd /Users/igorganapolsky/workspace/git/igor/skool_top1percent`
- `python3 scripts/revenue_ops/deploy_restaurant_ai_answering_route.py --approval "APPROVE DEPLOY RESTAURANT AI ANSWERING ROUTE"`
- `python3 scripts/revenue_ops/restaurant_ai_answering_route_preflight.py --live`
- `python3 scripts/revenue_ops/restaurant_live_intake_fallback.py`
- `python3 scripts/revenue_ops/restaurant_scout_close_packet.py`
- `python3 scripts/revenue_ops/restaurant_checkout_recovery_queue.py`
- `python3 scripts/revenue_ops/export_restaurant_focus_to_compiled_vault.py`
- `python3 scripts/revenue_ops/next_dollar_distance.py`
