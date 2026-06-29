---
type: "deploy-readiness"
project: "restaurant-ai-answering"
source_status: "local-export"
last_verified: "2026-06-29T13:51:03+00:00"
canonical_source: "reports/gtm/2026-06-29-money-today/restaurant-ai-answering-deploy-readiness.md"
---
# Restaurant AI Answering Deploy Readiness

Generated: 2026-06-29

Goal: make the restaurant agentic AI answering buyer path live so approved outreach can send buyers to a recoverable $499 diagnostic route.

No deploy, push, post, DM, email, or payment action is authorized by this file.

## Current Live Truth

- `https://site-gamma-one-15.vercel.app/restaurant-ai-answering`
  - Live readback on 2026-06-29 returned `HTTP/2 404`.
- `https://site-gamma-one-15.vercel.app/llms.txt`
  - Live readback did not contain `Restaurant AI Answering` or `restaurant-ai-answering`.
- Local Vercel CLI exists:
  - `vercel --version` returned `53.1.0`.
- Local project metadata exists:
  - `site/.vercel/project.json` has project name `site`.

## Repo-Ready Truth

Local files now include:

- `site/restaurant-ai-answering.html`
- `site/vercel.json` rewrite for `/restaurant-ai-answering`
- `site/start-speed-to-lead.html` support for `offer=restaurant_diagnostic`
- `site/api/checkout_intent.py` route for `restaurant_diagnostic`
- `site/api/audit_form.py` route for `restaurant_diagnostic`
- `site/sitemap.xml` entry for `/restaurant-ai-answering`
- `site/llms.txt` entry for the Restaurant AI Answering Diagnostic
- `tests/test_skool_revenue_intelligence.py` coverage for the route and checkout mapping
- `site/assets/kitchen57-restaurant-answering-map-2026-06-29.pdf` sample map PDF
- `scripts/revenue_ops/deploy_restaurant_ai_answering_route.py` approval-gated deploy runner

## Local Verification Commands

Run before deploy:

```bash
python3 scripts/revenue_ops/restaurant_ai_answering_route_preflight.py
python3 -m pytest tests/test_skool_revenue_intelligence.py -k 'restaurant_diagnostic or restaurant_ai_answering or checkout_intent_restaurant' -q
```

Expected local result:

```text
ok=true
2 passed, 155 deselected
```

## Deployment Approval Gate

Exact approval phrase required before deploying:

`APPROVE DEPLOY RESTAURANT AI ANSWERING ROUTE`

Suggested command after approval:

```bash
cd /Users/igorganapolsky/workspace/git/igor/skool_top1percent
python3 scripts/revenue_ops/deploy_restaurant_ai_answering_route.py --approval "APPROVE DEPLOY RESTAURANT AI ANSWERING ROUTE"
```

Dry-run without deployment:

```bash
python3 scripts/revenue_ops/deploy_restaurant_ai_answering_route.py --dry-run
```

## Post-Deploy Readback

Run after deploy:

```bash
cd /Users/igorganapolsky/workspace/git/igor/skool_top1percent
python3 scripts/revenue_ops/restaurant_ai_answering_route_preflight.py --live
curl -fsSL https://site-gamma-one-15.vercel.app/restaurant-ai-answering | rg -n 'Restaurant AI Answering Diagnostic|restaurant_diagnostic|Start the \\$499 diagnostic'
curl -fsSL 'https://site-gamma-one-15.vercel.app/start-speed-to-lead?source=restaurant_ai_answering&offer=restaurant_diagnostic' | rg -n 'Start the restaurant AI answering diagnostic|restaurant_diagnostic|verified restaurant/POS diagnostic'
```

Success criteria:

- `/restaurant-ai-answering` returns `HTTP 200`.
- Page contains `Restaurant AI Answering Diagnostic`.
- Page links to `/start-speed-to-lead?source=restaurant_ai_answering&offer=restaurant_diagnostic`.
- Precheckout page supports `restaurant_diagnostic`.
- `scripts/revenue_ops/restaurant_ai_answering_route_preflight.py --live` returns `ok=true`.
- `scripts/revenue_ops/restaurant_live_intake_fallback.py` returns `ready=true`.
- `reports/gtm/2026-06-29-money-today/restaurant-scout-close-packet.md` no longer says `waiting_for_live_intake_or_deploy`.
- The compiled Obsidian vault export is refreshed after deploy.

## Revenue Next Step After Deploy

After live route verification, update the approval-ready reply in:

`reports/gtm/2026-06-29-money-today/operator-close-packet.md`

Then request approval for:

`APPROVE POINTLESS POS DIAGNOSTIC REPLY`

Do not send the reply before live thread readback confirms the target is current and the reply is not a duplicate.
