---
type: "close-packet"
project: "restaurant-ai-answering"
source_status: "local-export"
last_verified: "2026-06-29T13:54:46+00:00"
canonical_source: "reports/gtm/2026-06-29-money-today/operator-close-packet.md"
---
# Operator Close Packet: 2026-06-29

Purpose: move the active goal toward $300/day after tax from restaurant agentic AI answering.

No external post, DM, email, checkout send, or form submission is authorized by this file.

## Money Truth

- Revenue booked in this packet: `$0.00`
- Captured payment verified in this packet: `$0.00`
- Planning target: `$300/day after tax`
- Working pre-tax net target: about `$429/day` with a 30% tax reserve
- Current close unit: `$499` restaurant/POS diagnostic

## Verified Buyer-Facing Assets

Verified on 2026-06-29:

- Stripe checkout route: `https://buy.stripe.com/eVq28rfCY0aOdWh5e33sI0N`
  - `curl -IL` returned `HTTP/2 200`.
- Gumroad diagnostic route: `https://iganapolsky.gumroad.com/l/qsr-ai-automation-diagnostic`
  - `curl -IL` returned `HTTP/2 200`.
- Gumroad template-pack route: `https://iganapolsky.gumroad.com/l/qsr-ai-ops-pack`
  - `curl -IL` returned `HTTP/2 200`.
- Public preview repo: `https://github.com/IgorGanapolsky/qsr-ai-preview`
  - `gh repo view` verified the repo is `PUBLIC`.
  - README states the $499 diagnostic asks for POS export plus one workflow and returns an integration path, approval gate, and smallest paid pilot.
- Local buyer page added for deployment: `site/restaurant-ai-answering.html`
  - Intended deployed route: `https://site-gamma-one-15.vercel.app/restaurant-ai-answering`
  - Do not claim the deployed route is live until Vercel/deploy verification succeeds.
- POS compatibility map: `https://raw.githubusercontent.com/IgorGanapolsky/qsr-ai-preview/main/docs/pos-compatibility-map.md`
  - `curl -fsSL` returned the map with first integration surfaces and low-risk pilot rules.

Broken or unsafe to use without repair:

- `https://igorganapolsky.github.io/qsr-n8n-workflow-vault-site/`
  - `curl -IL` redirected to `https://igorganapolsky.com/qsr-n8n-workflow-vault-site/` and returned `HTTP/2 404`.
- `https://igorganapolsky.github.io/qsr-n8n-workflow-vault-site/pos-compatibility-demo.html`
  - `curl -IL` redirected to `https://igorganapolsky.com/qsr-n8n-workflow-vault-site/pos-compatibility-demo.html` and returned `HTTP/2 404`.

## Selected Target

### POS Compatibility / Pointless POS Pattern

Why this target:

- It matches the restaurant agentic answering focus.
- It has a clear integration-surface question: POS API, webhooks, exports, manager notes, or reporting.
- It maps directly to the verified $499 diagnostic close unit.
- It avoids stale Skool seller-room replies marked disqualified in `reports/gtm/followup_ledger.csv`.

Evidence:

- `sales/restaurant-ai-answering-lead-queue-2026-06-29.md`
- `sales/pos-compatibility-audit.md`
- `scripts/revenue_ops/skool_lead_analyzer.py`
- `reports/gtm/2026-05-12-money-today/operator-close-packet.md`
- `https://github.com/IgorGanapolsky/qsr-ai-preview`
- `https://raw.githubusercontent.com/IgorGanapolsky/qsr-ai-preview/main/docs/pos-compatibility-map.md`

Workflow pain:

Restaurant/POS builders and operators often ask "MCP vs webhooks" too early. The paid diagnostic should force the correct first decision: which low-risk workflow can be built from the actual integration surface.

Requested proof before paid close:

- API docs, webhook docs, sample order export, or sample customer export
- Current manager reporting or note surface
- One workflow they want to automate first: order intake, missed follow-up, inventory, review triage, loyalty winback, or manager digest

Diagnostic promise:

For $499, map the first low-risk restaurant automation worth building: data source, integration path, human approval point, failure guardrail, setup checklist, and smallest paid pilot.

## Approval-Ready Reply

Approval phrase:

`APPROVE POINTLESS POS DIAGNOSTIC REPLY`

Draft:

```text
I would not choose MCP vs webhooks in the abstract.

For a restaurant/POS workflow, I would first look at the actual surface you expose: order export, customer/contact export, webhooks, manager notes, review feed, or shift reports. Then I would pick the first workflow that can safely run beside the POS without touching refunds, menu availability, allergy handling, or tax logic.

The low-risk first workflows are usually order intake cleanup, missed follow-up, review triage, loyalty/winback, inventory reorder alerts, or a daily manager digest.

If you want, send the rough integration surface first: API docs, webhook docs, sample order export, or even a screenshot of the data you expose. I can tell you which workflow is the safest first pilot. If you want the proper map, I do that as a 48-hour $499 diagnostic: integration path, approval gate, failure guardrails, and smallest paid pilot.
```

Do not include checkout in the first reply unless the buyer asks for pricing, says they want the diagnostic, or sends integration evidence.

If they ask for proof first, send only:

```text
Here is the public preview: https://github.com/IgorGanapolsky/qsr-ai-preview

The useful part is the POS compatibility map: it ranks order exports, customer/contact exports, inventory, reviews, shift notes, and missed-call/DM/SMS surfaces by the safest first workflow.
```

If they explicitly ask for payment:

```text
The 48-hour diagnostic is $499. Send the POS/API/webhook/export surface plus one workflow you want to automate, and I will return the integration path, human approval point, failure guardrails, and smallest paid pilot.

Checkout: https://buy.stripe.com/eVq28rfCY0aOdWh5e33sI0N
```

## Ralph/GSD Rule

Ralph Loop bet:

If the message asks for concrete POS integration evidence before pitching the build, a serious restaurant/POS buyer is more likely to reveal whether there is a real $499 diagnostic opportunity.

GSD action:

Use exactly one approval-gated reply: `APPROVE POINTLESS POS DIAGNOSTIC REPLY`.

Revenue math:

- One $499 close can satisfy the daily `$429` pre-tax planning target before payment fees.
- If no payment happens, the next valid state change is integration evidence received, pricing requested, or diagnostic call/payment step scheduled.

## Verification Plan

Before any external action:

1. Live-read the target thread or DM.
2. Confirm the target has not already received this reply.
3. Confirm the reply box is enabled.
4. If posting via browser automation, reload after submission and verify the persisted reply appears outside editor/input scopes.
5. Record the exact URL, timestamp, and proof artifact.

After any approved action:

1. Update `sales/restaurant-ai-answering-lead-queue-2026-06-29.md`.
2. Update `obsidian_vault/tasks/restaurant-ai-answering-gsd-queue.md` if the local ignored vault is being used by agents.
3. Record outcome in the relevant report or ledger.
4. Do not claim revenue unless Stripe/Gumroad/payment evidence shows captured money or a signed paid agreement exists.
