---
type: "operator-coordination"
project: "restaurant-ai-answering"
source_status: "local-export"
last_verified: "2026-06-29T13:54:46+00:00"
canonical_source: "reports/gtm/hermes-codex-coordination.md"
---
# Hermes/Codex Coordination

Generated: `2026-06-29T13:54:00+00:00`

- Active operator: `hermes_telegram`
- Codex role: `evidence_scoring_guardrails_patches`
- Hermes role: `telegram_control_room_live_operator`
- Ralph loop active: `true`
- Duplicate risk: `false`

## Next Action

- Type: `approval_gated_restaurant_deploy`
- Owner: `hermes_telegram`
- Status: `waiting_for_action_time_approval`
- Requires action-time approval: `true`
- Approval keyword: `APPROVE DEPLOY RESTAURANT AI ANSWERING ROUTE`
- Target: Restaurant AI answering buyer route deploy readiness
- Thread: `https://site-gamma-one-15.vercel.app/restaurant-ai-answering`
- Guard evidence: `/Users/igorganapolsky/workspace/git/igor/skool_top1percent/reports/gtm/restaurant-deploy-approval-request.json`
- Money action queue: `reports/gtm/hermes-money-action-queue.json`
- Exact approval request: `reports/gtm/hermes-approval-request.md`
- Approval cards ready: `6`
- Post-approval runbook: `reports/gtm/hermes-post-approval-runbook.md`
- Post-approval runbooks ready: `1`
- Close-reply readiness: `reports/gtm/hermes-close-reply-readiness.md`
- Close-reply intake paths ready: `true`
- Intake URL readiness: `reports/gtm/hermes-intake-url-readiness.md`
- Intake URLs live: `true`
- Intake context readiness: `reports/gtm/hermes-intake-context-readiness.md`
- Local intake source context matched: `true`
- Live intake context readiness: `reports/gtm/hermes-live-intake-context-readiness.md`
- Live intake source context matched: `false`
- Active action live readiness: `reports/gtm/2026-06-29-money-today/restaurant-live-intake-fallback.md`
- Active action live readiness source: `restaurant_live_intake_fallback`
- Active action live readiness matched: `false`
- Hermes next-action alert: `reports/gtm/hermes-next-action-alert.txt`
- Hermes next-action alert sent: `false`
- Hermes next-action alert message id: ``
- Hermes approval signal: `reports/gtm/hermes-approval-signal-readiness.md`
- Hermes exact approval received: `false`
- Hermes approval signal status: `waiting_for_action_time_approval`
- Hermes approval nudge: `reports/gtm/hermes-approval-nudge.txt`
- Hermes approval nudge sent: `false`
- Hermes approval nudge message id: ``
- Hermes approval autopilot: `reports/gtm/hermes-approval-autopilot.md`
- Hermes approval autopilot armed: `false`
- Hermes approval autopilot status: `not_ready`
- Hermes deploy signal: `reports/gtm/hermes-deploy-signal-readiness.md`
- Hermes deploy approval received: `false`
- Hermes deploy signal status: `waiting_for_exact_deploy_approval`
- Hermes deploy autopilot: `reports/gtm/hermes-deploy-autopilot.md`
- Hermes deploy autopilot armed: `true`
- Hermes deploy autopilot status: `waiting_for_exact_deploy_approval`
- Hermes deploy approval keyword: `APPROVE DEPLOY RESTAURANT AI ANSWERING ROUTE`
- Reason: Local buyer route is ready, but the live restaurant route and restaurant intake fallback are stale.

## Approval Transport

- Status: `alert_not_sent`
- Current exact approval: `APPROVE DEPLOY RESTAURANT AI ANSWERING ROUTE`
- Fallback exact approval: `APPROVE RESTAURANT SCOUT PHONE ORDERS`
- Fallback packet index: `reports/gtm/2026-06-29-money-today/restaurant-scout-execution-packets.md`
- Prepare alert: `python3 scripts/revenue_ops/hermes_next_action_alert.py`
- Send owner alert: `python3 scripts/revenue_ops/hermes_next_action_alert.py --apply`
- Prepare nudge: `python3 scripts/revenue_ops/hermes_approval_nudge.py`
- Send owner nudge: `python3 scripts/revenue_ops/hermes_approval_nudge.py --apply`
- Check exact approval: `python3 scripts/revenue_ops/hermes_approval_signal_readiness.py`
- Boundary: Only the --apply commands send Telegram messages to the owner/control room. They do not post to Reddit/Skool, deploy, create checkout sessions, or update ledgers.

## Deploy Verification Chain

- Verification commands: `22`

```bash
python3 scripts/revenue_ops/restaurant_vercel_deployment_snapshot.py
python3 scripts/revenue_ops/restaurant_ai_answering_route_preflight.py --live
python3 scripts/revenue_ops/restaurant_scout_guard_all.py
python3 scripts/revenue_ops/restaurant_live_intake_fallback.py
python3 scripts/revenue_ops/restaurant_approval_execution_packet.py
python3 scripts/revenue_ops/restaurant_scout_execution_packet.py --all
python3 scripts/revenue_ops/restaurant_scout_close_packet.py
python3 scripts/revenue_ops/stripe_readiness.py
python3 scripts/revenue_ops/restaurant_checkout_recovery_queue.py
python3 scripts/revenue_ops/checkout_intent_recovery_queue.py
python3 scripts/revenue_ops/stripe_checkout_recovery_queue.py
python3 scripts/revenue_ops/restaurant_paid_diagnostic_fulfillment_packet.py
python3 scripts/revenue_ops/restaurant_payment_fulfillment_readiness.py
python3 scripts/revenue_ops/restaurant_manual_checkout_readiness.py
python3 scripts/revenue_ops/restaurant_buyer_reply_router.py
python3 scripts/revenue_ops/next_dollar_distance.py
python3 scripts/revenue_ops/hermes_money_action_queue.py
python3 scripts/revenue_ops/hermes_approval_request.py
python3 scripts/revenue_ops/hermes_post_approval_runbook.py
python3 scripts/revenue_ops/hermes_next_action_alert.py
python3 scripts/revenue_ops/hermes_codex_coordination.py
python3 scripts/revenue_ops/export_restaurant_focus_to_compiled_vault.py --verify
```

## Restaurant Queue

- Queue path: `reports/gtm/hermes-money-action-queue.json`
- Restaurant actions: `7`
- Deploy prerequisite: `APPROVE DEPLOY RESTAURANT AI ANSWERING ROUTE` status=`prerequisite_approval`
- Ready first-touch actions: `5`
- Ready first-touch approvals: `APPROVE RESTAURANT SCOUT PHONE ORDERS, APPROVE RESTAURANT SCOUT TOAST MENU, APPROVE RESTAURANT SCOUT AI USE OPS, APPROVE RESTAURANT SCOUT MISSED RESERVATIONS, APPROVE RESTAURANT SCOUT TOAST MARKETPLACE`
- Deploy-pending fallback approval: `APPROVE RESTAURANT SCOUT PHONE ORDERS`
- Deploy-pending fallback allowed: `true`
- Deploy-pending fallback target: Phone Orders / Maple POS integration question
- Deploy-pending fallback guard: `/Users/igorganapolsky/workspace/git/igor/skool_top1percent/reports/gtm/2026-06-29-money-today/restaurant-scout-guard.json`
- Deploy-pending fallback rule: Deploy remains the top prerequisite, but this no-link restaurant first touch can start demand while the route is pending. It still requires exact approval and platform readback.
- Route-pending bridge rule: If a restaurant buyer asks for price, link, proof, or deliverables while the route is pending, use the route-pending bridge approvals from the restaurant approval execution packet.
- Manual checkout rule: Use manual checkout only after the buyer supplied restaurant URL, POS/menu surface, costly workflow path, and asks to pay.
- Manual checkout readiness: `reports/gtm/2026-06-29-money-today/restaurant-manual-checkout-readiness.md`
- Manual checkout ready: `true`
- Manual checkout approval: `APPROVE RESTAURANT SCOUT MANUAL CHECKOUT: CONFIRMED FIT READY TO PAY`
- Manual checkout requirements: `8`
- Manual checkout blockers: `0`
- Buyer reply router: `reports/gtm/2026-06-29-money-today/restaurant-buyer-reply-router.md`
- Buyer reply router classification: `no_buyer_reply_supplied`
- Buyer reply router status: `waiting_for_buyer_reply`
- Buyer reply router approval: `none`
- Buyer reply router command: `python3 scripts/revenue_ops/restaurant_buyer_reply_router.py --reply "<buyer reply>"`

### Ready Restaurant First Touches

| Rank | Priority | Approval | Target | Guard |
|---:|---:|---|---|---|
| 2 | 96.8 | `APPROVE RESTAURANT SCOUT PHONE ORDERS` | Phone Orders / Maple POS integration question | `/Users/igorganapolsky/workspace/git/igor/skool_top1percent/reports/gtm/2026-06-29-money-today/restaurant-scout-guard.json` |
| 3 | 95.9 | `APPROVE RESTAURANT SCOUT TOAST MENU` | Embedding dynamic Toast menus on a website | `/Users/igorganapolsky/workspace/git/igor/skool_top1percent/reports/gtm/2026-06-29-money-today/restaurant-scout-guard-toast-menu.json` |
| 4 | 95.2 | `APPROVE RESTAURANT SCOUT AI USE OPS` | AI use in restaurants. | `/Users/igorganapolsky/workspace/git/igor/skool_top1percent/reports/gtm/2026-06-29-money-today/restaurant-market-intel-guard-ai-use.json` |
| 5 | 94.8 | `APPROVE RESTAURANT SCOUT MISSED RESERVATIONS` | Using AI voice agents for expanding my business? | `/Users/igorganapolsky/workspace/git/igor/skool_top1percent/reports/gtm/2026-06-29-money-today/restaurant-scout-guard-missed-reservations.json` |
| 6 | 94.2 | `APPROVE RESTAURANT SCOUT TOAST MARKETPLACE` | Small town delivery service routing marketplace orders into Toast POS | `/Users/igorganapolsky/workspace/git/igor/skool_top1percent/reports/gtm/2026-06-29-money-today/restaurant-scout-guard-toast-marketplace.json` |

## Money State

- Next-dollar score: `78.5/100`
- Band: `high`
- Captured: `$0.00`
- Stripe first-dollar capture ready: `true`
- Stripe payouts block captured first dollar: `false`
- Fastest move: Deploy prerequisite is ranked first; next is exact `APPROVE DEPLOY RESTAURANT AI ANSWERING ROUTE` for Restaurant AI answering buyer route deploy readiness so the restaurant buyer route can go live before sending buyer traffic.
- Precheckout recovery queue: `0`
- Stripe recovery queue: `0`
- Fit-check queue: `0`

## Do Not Duplicate

- Do not install another scheduled sender/poster while Hermes is active.
- Do not auto-post Skool comments from Codex without exact action-time approval.
- Do not restart cold email volume while delivered-with-no-engagement remains the top channel signal.

## Smartness Upgrades

- `single_operator_ownership`: prevents Codex and Hermes from running duplicate loops — `active`
- `guard_passed_action_inventory`: Hermes can act from a ready queue instead of re-reasoning each cycle — `active`
- `compiled_exact_approval_card`: Hermes can ask for exact action-time approval without dereferencing guard files — `active`
- `post_approval_confirmation_runbook`: after a visible post, Hermes has exact commands to confirm, monitor, and route close replies — `active`
- `validated_close_reply_paths`: buyer intent replies can route to source-preserving intake or fit-check paths — `active`
- `live_intake_url_readiness`: source-preserving intake and fit-check URLs return usable public pages — `active`
- `matched_intake_source_context`: Hermes close-reply sources land on intake copy matched to the buyer thread — `active`
- `live_matched_intake_source_context`: production intake pages contain the matched Hermes source context a buyer will actually see — `missing`
- `telegram_next_action_alert`: pushes the current approval card into the Hermes/Telegram control room — `missing`
- `exact_approval_signal_gate`: separates owner alert delivery from public-action permission — `waiting`
- `concise_approval_nudge`: reduces approval latency when the full approval card was already delivered — `not_sent`
- `approval_gated_autopilot`: removes execution delay after exact approval while preserving the Skool approval gate — `not_armed`
- `approval_gated_deploy_autopilot`: removes production deploy delay after exact deploy approval while preserving the deploy approval gate — `armed`
- `qualified_manual_checkout_gate`: lets Hermes route an already-qualified buyer to checkout without exposing payment links in first touches — `active`
- `buyer_reply_router`: keeps bridge, close, checkout, and paid-fulfillment replies classified from the actual buyer text — `active`
- `channel_switch_after_no_engagement`: stops wasting sends when email delivery has no opens/clicks — `active`
- `source_preserving_recovery`: future interested buyers become recoverable before Stripe — `active`
