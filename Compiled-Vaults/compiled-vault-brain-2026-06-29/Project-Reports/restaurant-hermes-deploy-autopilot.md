---
type: "deploy-autopilot"
project: "restaurant-ai-answering"
source_status: "local-export"
last_verified: "2026-06-29T13:54:46+00:00"
canonical_source: "reports/gtm/hermes-deploy-autopilot.md"
---
# Hermes Deploy Autopilot

Generated: `2026-06-29T13:53:56+00:00`

Scope: approval-gated Vercel deploy. No deploy runs unless `--apply` is used and exact deploy approval is detected after the deploy request.

- Status: `waiting_for_exact_deploy_approval`
- Armed: `true`
- Ready to execute: `false`
- Apply requested: `true`
- Approval keyword: `APPROVE DEPLOY RESTAURANT AI ANSWERING ROUTE`
- Project path: `/Users/igorganapolsky/workspace/git/igor/skool_top1percent`

## Command

```bash
python3 scripts/revenue_ops/deploy_restaurant_ai_answering_route.py --approval 'APPROVE DEPLOY RESTAURANT AI ANSWERING ROUTE'
```

## Waiting / Not Ready

- `deploy_signal_not_ready`

## Verification Commands

After an approved deploy, every command below must complete before buyer traffic is treated as ready.

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
