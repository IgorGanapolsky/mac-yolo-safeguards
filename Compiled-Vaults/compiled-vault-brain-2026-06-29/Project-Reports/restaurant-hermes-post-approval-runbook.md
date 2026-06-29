---
type: "post-approval-runbook"
project: "restaurant-ai-answering"
source_status: "local-export"
last_verified: "2026-06-29T13:54:46+00:00"
canonical_source: "reports/gtm/hermes-post-approval-runbook.md"
---
# Hermes Post-Approval Runbook

Generated: `2026-06-29T13:53:57+00:00`

Scope: local runbook only. No Skool post, DM, reaction, phone call, Telegram message, or payment action was executed.

- Ready post-approval runbooks: `1`

## Top Runbook

- Approval keyword: `APPROVE DEPLOY RESTAURANT AI ANSWERING ROUTE`
- Target: Restaurant AI answering buyer route deploy readiness
- Thread: `https://site-gamma-one-15.vercel.app/restaurant-ai-answering`
- Dispatch: ``
- Guard: `/Users/igorganapolsky/workspace/git/igor/skool_top1percent/reports/gtm/restaurant-deploy-approval-request.json`
- First-touch revenue route: `https://buy.stripe.com/eVq28rfCY0aOdWh5e33sI0N`
- Close offer: `restaurant_diagnostic`
- Recoverable intake path: `https://site-gamma-one-15.vercel.app/start-speed-to-lead?source=restaurant_ai_answering&offer=restaurant_diagnostic`
- Fit-check path: `https://site-gamma-one-15.vercel.app/speed-to-lead?source=restaurant_ai_answering&offer=restaurant_diagnostic#fit-check`
- Posted by this runbook: `false`

### After Exact Approval

Run this deploy command only after the exact restaurant deploy approval is present:

```bash
python3 scripts/revenue_ops/deploy_restaurant_ai_answering_route.py --approval "APPROVE DEPLOY RESTAURANT AI ANSWERING ROUTE"
```

### Approved Execution Bundle

After the exact restaurant deploy approval is present, this bundle performs the deploy and refreshes route, payment, recovery, queue, score, and vault evidence in order:

```bash
python3 scripts/revenue_ops/deploy_restaurant_ai_answering_route.py --approval "APPROVE DEPLOY RESTAURANT AI ANSWERING ROUTE"
```

### Validate The Buyer Path

Run this command after deployment. It proves the restaurant buyer route is live before any buyer traffic is sent:

```bash
python3 scripts/revenue_ops/restaurant_ai_answering_route_preflight.py --live
```

### Then Refresh Money Evidence

```bash
python3 scripts/revenue_ops/restaurant_vercel_deployment_snapshot.py
```
```bash
python3 scripts/revenue_ops/restaurant_ai_answering_route_preflight.py --live
```
```bash
python3 scripts/revenue_ops/restaurant_scout_guard_all.py
```
```bash
python3 scripts/revenue_ops/restaurant_live_intake_fallback.py
```
```bash
python3 scripts/revenue_ops/restaurant_approval_execution_packet.py
```
```bash
python3 scripts/revenue_ops/restaurant_scout_execution_packet.py
```
```bash
python3 scripts/revenue_ops/restaurant_scout_close_packet.py
```
```bash
python3 scripts/revenue_ops/stripe_readiness.py
```
```bash
python3 scripts/revenue_ops/restaurant_checkout_recovery_queue.py
```
```bash
python3 scripts/revenue_ops/checkout_intent_recovery_queue.py
```
```bash
python3 scripts/revenue_ops/stripe_checkout_recovery_queue.py
```
```bash
python3 scripts/revenue_ops/hermes_money_action_queue.py
```
```bash
python3 scripts/revenue_ops/hermes_approval_request.py
```
```bash
python3 scripts/revenue_ops/hermes_post_approval_runbook.py
```
```bash
python3 scripts/revenue_ops/restaurant_paid_diagnostic_fulfillment_packet.py
```
```bash
python3 scripts/revenue_ops/restaurant_payment_fulfillment_readiness.py
```
```bash
python3 scripts/revenue_ops/restaurant_manual_checkout_readiness.py
```
```bash
python3 scripts/revenue_ops/restaurant_buyer_reply_router.py
```
```bash
python3 scripts/revenue_ops/next_dollar_distance.py
```
```bash
python3 scripts/revenue_ops/hermes_next_action_alert.py
```
```bash
python3 scripts/revenue_ops/hermes_codex_coordination.py
```
```bash
python3 scripts/revenue_ops/export_restaurant_focus_to_compiled_vault.py --verify
```

### If The Buyer Replies With Intent

After the route is live, use one of these prepared restaurant approval cards only after fresh live readback confirms the target and duplicate risk.

- `APPROVE RESTAURANT SCOUT CLOSE: ASKED PRICE`
- `APPROVE RESTAURANT SCOUT CLOSE: ASKED FOR LINK`
- `APPROVE RESTAURANT SCOUT CLOSE: ASKED WHAT THEY GET`
- `APPROVE RESTAURANT SCOUT CLOSE: CONFIRMED POS FIT`
- `APPROVE RESTAURANT SCOUT CLOSE: ASKED FOR PROOF`

## All Runbooks

| Rank | Keyword | Target |
|---:|---|---|
| 1 | `APPROVE DEPLOY RESTAURANT AI ANSWERING ROUTE` | Restaurant AI answering buyer route deploy readiness |
