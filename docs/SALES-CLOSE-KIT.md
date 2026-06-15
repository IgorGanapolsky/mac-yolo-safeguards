# Sales Close Kit

This is the operator playbook for turning the offer ladder into paid revenue. Use it for every qualified buyer conversation until the system has enough data to replace judgment with a more formal CRM.

Revenue target: $300/day after tax.

Primary path: sell high-ticket reliability work first, then attach ThumbGate Pro or Team as the ongoing governance layer.

## Qualification Score

Score each prospect before offering a paid call.

| Signal | Points | Evidence |
|---|---:|---|
| Uses autonomous coding agents weekly | 2 | Claude Code, Cursor, Codex, Antigravity, Devin, or similar in real work. |
| Has a repeated failure pattern | 2 | Same bad fix, retry loop, runaway process, token burn, broken deployment, or client incident. |
| Failure has a business cost | 2 | Lost hours, API spend, client trust, delivery risk, data safety, or machine instability. |
| Buyer controls budget | 2 | Founder, agency owner, team lead, consultant, or engineering manager. |
| Can share a workflow or repo context | 1 | Private screen share is fine; public repo is not required. |
| Needs repeatability, not just advice | 1 | Wants a checklist, gates, proof, team rollout, or client package. |

Routing:

| Score | Action |
|---:|---|
| 0-3 | Send free repo and ThumbGate link. Do not book paid work. |
| 4-5 | Offer $499 Agent Reliability Diagnostic. |
| 6-8 | Offer $1,500 AI Agent Hardening Sprint. |
| 9-10 | Offer $3,000 Partner Pilot. |

For outreach queues, use `tools/prospect-score.js` against a private ignored `prospects.tsv` file. `docs/prospects.example.tsv` is synthetic example data only.

After contact paths and draft sections exist, use `tools/outreach-queue.js` to verify every paid-route prospect has a send path and a draft before sending.

Use `tools/outreach-actions.js` to turn the private send queue into manual `mailto:` links and booking-form URLs. This prepares outreach; it does not send anything automatically.

Before sending, generate the private manual send checklist with `tools/send-plan.js`. Pass the private Stripe offer map and `--stripe-status ready` when prioritizing immediate revenue so rows without a valid Stripe price and payment link do not crowd out payable offers. After sending, track each prospect in a private `pipeline-status-YYYY-MM-DD.tsv` file with `tools/pipeline-update.js` and summarize with `tools/pipeline-summary.js`. Only cleared Stripe payments entered into the revenue ledger count as revenue proof.

## Discovery Call

Goal: decide whether the buyer has a paid reliability problem in 20 minutes.

Questions:

1. Which agent stack do you run in real work?
2. What failure happened more than once?
3. What did it cost in hours, money, trust, or delivery risk?
4. What did you already try?
5. What would prove the problem is fixed?
6. Who needs to approve the spend?
7. Is this for your own team or for clients?

Disqualifiers:

- They only want free installation help.
- They cannot name a repeated failure.
- They have no cost attached to the failure.
- They want broad enterprise guarantees before a paid diagnostic.
- They need compliance artifacts that do not exist yet.

## Offer Scripts

Diagnostic:

> The right first step is a $499 diagnostic. I will inspect one repeated failure pattern, map the likely root cause, and give you a written hardening plan with the specific guardrails I would install. If there is no paid fix worth doing, the diagnostic says that directly.

Hardening sprint:

> This is a $1,500 implementation sprint. I will wire the Mac guard and ThumbGate memory gates into one real workflow, run a smoke test, and leave you with evidence and handoff notes. The point is not generic advice; it is one failure pattern blocked or escalated with proof.

Partner pilot:

> This is a $3,000 partner pilot for agencies and consultants. You get the sprint plus a reusable client checklist, demo script, and rollout support so you can sell agent reliability as part of your own delivery package.

## Proposal Template

Subject: AI Agent Reliability Hardening proposal

Scope:

- Target workflow:
- Agent stack:
- Repeated failure:
- Business cost:
- Success proof:

Deliverables:

- Incident readout or hardening plan.
- Guardrail implementation where in scope.
- ThumbGate repeated-mistake gates where in scope.
- Smoke-test evidence.
- Handoff notes and next actions.

Price:

- Diagnostic: $499
- Hardening sprint: $1,500
- Partner pilot: $3,000

Terms:

- Payment due before work starts.
- One target workflow per engagement unless agreed otherwise.
- No guarantee that every agent mistake is preventable.
- No telemetry is added to `mac-yolo-safeguards`.
- GUI apps with unsaved work are not auto-killed.

## Payment Workflow

1. Confirm the routed offer and price in writing.
2. Generate the private proposal/payment handoff:

```sh
node tools/proposal-plan.js \
  --prospect prospect-label \
  --date YYYY-MM-DD \
  --stripe-offer-map stripe-offer-map-YYYY-MM-DD.tsv
```

To generate handoffs for every selected close in the current close-target plan:

```sh
node tools/proposal-batch-plan.js --date YYYY-MM-DD
```

3. Send the current Stripe payment link or invoice from the Stripe Dashboard only after the proposal plan shows `Price status: ready` and `Link status: ready`.
4. Record the buyer, source, offer, price, and payment status in the private CRM or Cal.com notes.
5. Start work only after Stripe shows paid or the invoice is contractually approved.
6. After Stripe clears, run `tools/record-cleared-payment.js` so the private revenue ledger and pipeline agree.
7. After delivery, record the proof artifacts and whether the buyer should move to ThumbGate Pro or Team.

Do not reference hardcoded Stripe product IDs in buyer-facing copy until duplicate products are cleaned up in Stripe. Current Stripe search shows many `ThumbGate Pro` products, so product IDs are not reliable sales instructions.

## Delivery Checklist

Diagnostic:

- Failure pattern written in one sentence.
- Reproduction path or reason reproduction is not practical.
- Evidence reviewed.
- Root-cause hypothesis.
- Guardrail recommendation.
- Buy/no-buy recommendation for sprint.

Hardening sprint:

- `mac-yolo-safeguards` install or config verified.
- `yolo-health` output captured.
- ThumbGate rule or memory gate captured for the repeated mistake.
- Smoke test run.
- Before/after notes written.
- Follow-up ownership assigned.

Partner pilot:

- Sprint checklist completed.
- Client-facing checklist created.
- Demo script created.
- One rollout path selected.
- Upsell path to ThumbGate Team documented.

## Objections

| Objection | Response |
|---|---|
| We can install the repo ourselves. | Yes. The paid work is for repeated agent behavior, proof, and team rollout, not shell-script installation. |
| This should be a SaaS subscription. | The SaaS layer helps after the workflow is understood. The first paid step is diagnosing and hardening the failure that already costs you money. |
| Can you guarantee no failures? | No. The offer is scoped to one repeated failure pattern with evidence, not a blanket guarantee. |
| We need SOC 2 or enterprise procurement. | That is out of scope for the first month. Start with a diagnostic only if the workflow risk is worth proving. |
| $1,500 is too high. | If the failure costs less than that, use the free repo. If it costs more, the sprint is priced below the recurring loss. |

## Close Evidence

The revenue goal is not achieved until Stripe and tax-reserved accounting prove at least $300/day after tax. Track:

- Gross revenue by offer.
- Stripe fees.
- Tax reserve.
- Refunds or disputes.
- Net after reserve.
- Days at or above $300 net.

Use `tools/revenue-net.js` against a private ignored ledger to calculate the result. `docs/revenue-ledger.example.tsv` is synthetic example data; it is not revenue evidence.

Do not claim the goal is complete from bookings, calls, stars, downloads, unpaid invoices, or the public example ledger.
