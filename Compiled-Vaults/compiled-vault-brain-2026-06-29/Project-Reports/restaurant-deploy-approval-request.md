---
type: "deploy-approval-request"
project: "restaurant-ai-answering"
source_status: "local-export"
last_verified: "2026-06-29T08:01:01+00:00"
canonical_source: "reports/gtm/restaurant-deploy-approval-request.md"
---
# Restaurant Deploy Approval Request

Generated: `2026-06-29T08:01:00+00:00`

Scope: local approval card only. No deploy, post, DM, email, form submission, checkout creation, phone call, or payment action was executed.

- Status: `waiting_for_exact_deploy_approval`
- Approval keyword: `APPROVE DEPLOY RESTAURANT AI ANSWERING ROUTE`
- External side effect if approved: `production Vercel deploy for restaurant AI answering route`
- Live route: `https://site-gamma-one-15.vercel.app/restaurant-ai-answering`
- Checkout URL: `https://buy.stripe.com/eVq28rfCY0aOdWh5e33sI0N`
- Reason: Local buyer route is ready, but the live restaurant route is not reachable yet.

## Readiness

- local_ready: `True`
- live_route_ready: `False`
- live_checkout_ready: `True`
- local_returncode: `0`
- live_returncode: `1`
- dry_run_returncode: `0`
- dry_run_ready: `True`

## Exact Approval

```text
APPROVE DEPLOY RESTAURANT AI ANSWERING ROUTE
```

## Local Dry-Run Command

- `cd /Users/igorganapolsky/workspace/git/igor/skool_top1percent`
- `python3 scripts/revenue_ops/deploy_restaurant_ai_answering_route.py --dry-run`

## Local Dry-Run Evidence

```text
# Restaurant AI Answering Route Preflight

- PASS: `local_page_exists` — site/restaurant-ai-answering.html
- PASS: `demo_page_exists` — site/restaurant-answering-demo.html
- PASS: `page_uses_recoverable_precheckout` — primary CTA includes restaurant_diagnostic precheckout
- PASS: `page_avoids_direct_checkout` — buyer page should capture checkout intent before Stripe
- PASS: `sample_map_asset_exists` — site/assets/kitchen57-restaurant-answering-map-2026-06-29.pdf exists and is non-empty
- PASS: `page_links_sample_map` — buyer page links the Kitchen 57 sample diagnostic map
- PASS: `page_links_workflow_demo` — buyer page links the static restaurant answering workflow demo
- PASS: `demo_routes_to_recoverable_precheckout` — workflow demo routes to restaurant_diagnostic precheckout
- PASS: `demo_has_safe_guardrails` — workflow demo shows safe routing and manager approval boundaries
- PASS: `page_avoids_broken_demo_url` — old GitHub Pages demo URL returned 404 on 2026-06-29
- PASS: `start_page_supports_restaurant_offer` — precheckout personalizes restaurant_diagnostic sources
- PASS: `vercel_rewrite_present` — Vercel rewrite routes /restaurant-ai-answering
- PASS: `demo_rewrite_present` — Vercel rewrite routes /restaurant-answering-demo
- PASS: `llms_lists_route` — llms.txt includes Restaurant AI Answering Diagnostic and demo routes
- PASS: `sitemap_lists_route` — sitemap includes Restaurant AI Answering Diagnostic and demo routes
- PASS: `checkout_mapping_present` — checkout_intent maps restaurant_diagnostic to verified POS checkout

ok=true
$ /opt/homebrew/opt/python@3.14/bin/python3.14 scripts/revenue_ops/restaurant_ai_answering_route_preflight.py
dry-run complete: local preflight passed; no deploy approval required for dry-run
deploy command would run from site/: vercel --prod
```

## Approved Command

- `cd /Users/igorganapolsky/workspace/git/igor/skool_top1percent`
- `python3 scripts/revenue_ops/deploy_restaurant_ai_answering_route.py --approval "APPROVE DEPLOY RESTAURANT AI ANSWERING ROUTE"`
- `python3 scripts/revenue_ops/restaurant_ai_answering_route_preflight.py --live`
- `python3 scripts/revenue_ops/restaurant_live_intake_fallback.py`
- `python3 scripts/revenue_ops/restaurant_scout_close_packet.py`
- `python3 scripts/revenue_ops/restaurant_checkout_recovery_queue.py`
- `python3 scripts/revenue_ops/export_restaurant_focus_to_compiled_vault.py`
- `python3 scripts/revenue_ops/next_dollar_distance.py`

## Post-Approval Verification Contract

After exact approval and deploy, do not treat the route as usable until every row below has current evidence.

| Check | Command | Required Evidence |
|---|---|---|
| `approved_deploy_runner` | `python3 scripts/revenue_ops/deploy_restaurant_ai_answering_route.py --approval "APPROVE DEPLOY RESTAURANT AI ANSWERING ROUTE"` | command exits 0 after Vercel deploy, live route verification, and artifact refresh |
| `live_route_200` | `python3 scripts/revenue_ops/restaurant_ai_answering_route_preflight.py --live` | live_restaurant_route_200, live_llms_lists_route, live_sitemap_lists_route, and live_restaurant_checkout_200 all PASS |
| `live_intake_or_close_path` | `python3 scripts/revenue_ops/restaurant_live_intake_fallback.py && python3 scripts/revenue_ops/restaurant_scout_close_packet.py` | close packet becomes ready from either verified dedicated route or verified live restaurant intake fallback |
| `payment_truth` | `python3 scripts/revenue_ops/stripe_readiness.py` | Stripe remains production_ready=true; captured today is reported from live Stripe truth |
| `agent_handoff` | `python3 scripts/revenue_ops/hermes_money_action_queue.py && python3 scripts/revenue_ops/hermes_approval_request.py && python3 scripts/revenue_ops/export_restaurant_focus_to_compiled_vault.py` | Hermes queue, approval request, and centralized vault reflect the deployed restaurant route |

## Live Check Summary

- `PASS` `local_page_exists` - site/restaurant-ai-answering.html
- `PASS` `demo_page_exists` - site/restaurant-answering-demo.html
- `PASS` `page_uses_recoverable_precheckout` - primary CTA includes restaurant_diagnostic precheckout
- `PASS` `page_avoids_direct_checkout` - buyer page should capture checkout intent before Stripe
- `PASS` `sample_map_asset_exists` - site/assets/kitchen57-restaurant-answering-map-2026-06-29.pdf exists and is non-empty
- `PASS` `page_links_sample_map` - buyer page links the Kitchen 57 sample diagnostic map
- `PASS` `page_links_workflow_demo` - buyer page links the static restaurant answering workflow demo
- `PASS` `demo_routes_to_recoverable_precheckout` - workflow demo routes to restaurant_diagnostic precheckout
- `PASS` `demo_has_safe_guardrails` - workflow demo shows safe routing and manager approval boundaries
- `PASS` `page_avoids_broken_demo_url` - old GitHub Pages demo URL returned 404 on 2026-06-29
- `PASS` `start_page_supports_restaurant_offer` - precheckout personalizes restaurant_diagnostic sources
- `PASS` `vercel_rewrite_present` - Vercel rewrite routes /restaurant-ai-answering
- `PASS` `demo_rewrite_present` - Vercel rewrite routes /restaurant-answering-demo
- `PASS` `llms_lists_route` - llms.txt includes Restaurant AI Answering Diagnostic and demo routes
- `PASS` `sitemap_lists_route` - sitemap includes Restaurant AI Answering Diagnostic and demo routes
- `PASS` `checkout_mapping_present` - checkout_intent maps restaurant_diagnostic to verified POS checkout
- `FAIL` `live_restaurant_route_200` - status=404 final_url=https://site-gamma-one-15.vercel.app/restaurant-ai-answering
- `FAIL` `live_llms_lists_route` - status=200 final_url=https://site-gamma-one-15.vercel.app/llms.txt
- `FAIL` `live_sitemap_lists_route` - status=200 final_url=https://site-gamma-one-15.vercel.app/sitemap.xml
- `PASS` `live_restaurant_checkout_200` - status=200 final_url=https://buy.stripe.com/eVq28rfCY0aOdWh5e33sI0N
