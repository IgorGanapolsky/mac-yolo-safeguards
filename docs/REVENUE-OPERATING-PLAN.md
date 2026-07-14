# Revenue Operating Plan

Target: $300/day after tax from `mac-yolo-safeguards` plus ThumbGate.

Current verified baseline as of 2026-06-02:

- Stripe live balance: $0 available, $0 pending.
- Launch-window Stripe evidence since 2026-05-27 UTC: one $19 charge and one new customer.
- `mac-yolo-safeguards`: 1 star, 0 forks, 0 issues.
- ThumbGate: 21 stars, 7 forks, 5 issues.
- npm `thumbgate`: 4,551 downloads from 2026-05-02 through 2026-05-31.

## Constraint

$300/day after tax is about $9,000/month net. With a conservative 35% tax reserve and card fees, the system needs roughly $14,000-$15,000/month gross.

Low-price SaaS cannot carry that target yet:

| Offer | Approximate volume needed |
|---|---:|
| ThumbGate Pro at $19/month | about 763 active customers |
| ThumbGate annual at $149/year | about 96 annual sales per month |
| ThumbGate Team at $49/seat/month | about 293 seats |
| Diagnostic at $499 | about 29 sales per month |
| Hardening sprint at $1,500 | about 10 sales per month |
| Partner pilot at $3,000 | about 5 sales per month |

## Strategy

Use the open-source repo as proof, not as the business model.

1. Sell paid diagnostics and hardening sprints to buyers with existing AI-agent pain.
2. Attach ThumbGate Pro or Team as the ongoing memory-governance layer.
3. Convert successful sprints into partner pilots for agencies and consultants.
4. Keep the free Mac guard narrow and trustworthy; do not add telemetry or overclaim prevention.

Operational close path: use [Sales Close Kit](./SALES-CLOSE-KIT.md) to qualify each buyer, route them to the correct offer, send Stripe payment, and record proof. Bookings and calls do not count toward the revenue target until payment clears.

## Weekly Scorecard

Track these every Friday:

| Metric | Target |
|---|---:|
| Qualified buyer conversations | 15/week |
| Diagnostic bookings | 3/week |
| Hardening sprint closes | 2/week |
| Partner pilot closes | 1/week |
| New ThumbGate paid seats | 10/week |
| Case-study updates with evidence | 1/week |

## Buyer Segments

Prioritize in this order:

1. AI automation agencies that can resell reliability to clients.
2. Founders running autonomous coding agents daily.
3. Dev teams with Cursor, Claude Code, Codex, or Antigravity in active workflows.
4. Consultants who need a client-safe agent operations package.

Do not spend the first month selling to casual GitHub readers. They are useful for credibility but not enough for the revenue target.

## Outreach Message

Subject: Quick question on AI-agent failures

I built a Mac guard after an AI coding agent drove my machine to load average 307 by spawning simulator processes in a loop. The open-source fix is here:

https://github.com/IgorGanapolsky/mac-yolo-safeguards

The deeper issue is usually not the Mac freeze. It is repeated agent behavior: same bad approach, same token burn, same failed workflow. I am running paid AI Agent Reliability Hardening sprints that combine local runaway protection with ThumbGate memory gates.

If your team or clients run Claude Code, Cursor, Codex, Antigravity, or similar agents, I can do a $499 diagnostic or a $1,500 hardening sprint around one recurring failure pattern.

Worth a 20-minute triage call?

## Daily Operating Loop

1. Find 20 buyers with public evidence of AI-agent work.
2. Add them to a private ignored `prospects.tsv` file using the columns from `docs/prospects.example.tsv`.
3. Score the queue:

```sh
node tools/prospect-score.js docs/prospects.example.tsv --status new --min-score 4
```

**Voice front door (SpaceXAI demos):** after a call, score + stage without inventing prices:

```sh
# Dry-run: exact pipeline-update.js command for the private TSV
node tools/hermes-voice-front-door.js --event apply-pipeline --json \
  --pipeline pipeline-status-YYYY-MM-DD.tsv \
  --date YYYY-MM-DD \
  --signals-json '{"prospect_label":"buyer","agent_stack":"yes","repeated_failure":"yes","business_cost":"yes","budget_owner":"no","segment":"founder","current_agent":"qualify","pipeline_stage":"ready"}'

# Write only when dry-run looks right:
# ... add --apply
```

Policy + demo pack: [HERMES-VOICE-FRONT-DOOR.md](./HERMES-VOICE-FRONT-DOOR.md). Phone is intake only — Stripe/ledger still prove revenue.

4. Generate the private send queue after contact paths and drafts exist:

```sh
node tools/outreach-queue.js \
  --prospects docs/prospects.example.tsv \
  --contacts contacts-YYYY-MM-DD.tsv \
  --drafts outreach-YYYY-MM-DD.md \
  --out send-queue-YYYY-MM-DD.tsv
```

5. Generate manual action links:

```sh
node tools/outreach-actions.js \
  --queue send-queue-YYYY-MM-DD.tsv \
  --out outreach-actions-YYYY-MM-DD.tsv
```

6. Initialize the private pipeline tracker before sending:

```sh
node tools/pipeline-init.js \
  --queue send-queue-YYYY-MM-DD.tsv \
  --out pipeline-status-YYYY-MM-DD.tsv \
  --date YYYY-MM-DD
```

7. Generate the private manual send plan:

```sh
node tools/send-plan.js \
  --date YYYY-MM-DD \
  --stripe-status ready \
  --limit 10
```

8. Send 10 tailored messages using a specific failure hypothesis. Use `--stripe-status ready` for outreach where the offer has both a valid Stripe price and payment link; use `--stripe-status missing` only to surface offers that need Stripe setup before a payment request.
9. Ask for one concrete incident, not general interest.
10. Route obvious pain to a $499 diagnostic.
11. Route agency or team pain to a $1,500 sprint or $3,000 partner pilot.
12. Record source, offer, objection, and next action in Stripe, Cal.com notes, or a private CRM.
13. Update the private ignored `pipeline-status-YYYY-MM-DD.tsv` file after each send, reply, booking, proposal, and loss:

```sh
node tools/pipeline-update.js \
  --pipeline pipeline-status-YYYY-MM-DD.tsv \
  --prospect prospect-label \
  --stage sent \
  --date YYYY-MM-DD \
  --next-action wait_for_reply \
  --note "sent manually"
```

Summarize the active pipeline:

```sh
node tools/pipeline-summary.js docs/pipeline-status.example.tsv
```

Summarize multiple active private trackers together:

```sh
node tools/pipeline-summary.js pipeline-status-*.tsv
```

Generate the private data-science and propensity report:

```sh
node tools/pipeline-data-science.js --date YYYY-MM-DD --limit 15
```

For every qualified reply, score it with `SALES-CLOSE-KIT.md` before offering a paid call.
For accepted proposals, generate the private handoff with `tools/proposal-plan.js` and the private Stripe offer map, send payment manually from Stripe, then enter cleared payment evidence into a private ignored revenue ledger. If the proposal plan says the Stripe price is missing, create or select the exact Stripe price before requesting payment.
For the selected close sequence, generate all private handoffs at once:

```sh
node tools/proposal-batch-plan.js --date YYYY-MM-DD
```

If the close target plan reports a backup link-ready row, generate backup
handoffs separately and use them only as replacements for lost or disqualified
selected closes:

```sh
node tools/proposal-batch-plan.js --date YYYY-MM-DD --include-backup
```

Backup handoffs are not extra revenue proof and must not be double-counted
against the selected-close target. Only cleared Stripe payments in the private
ledger count.

After Stripe shows a cleared payment, use the guarded recorder so the private ledger and pipeline agree:

```sh
node tools/record-cleared-payment.js \
  --ledger revenue-ledger-YYYY-MM.tsv \
  --pipeline pipeline-status-YYYY-MM-DD.tsv \
  --prospect prospect-label \
  --date-paid YYYY-MM-DD \
  --buyer-segment buyer-segment \
  --source direct-outreach \
  --stripe-fee-usd 87.30 \
  --refund-usd 0.00 \
  --proof-note "Stripe charge/invoice ID and private delivery proof location"
```

Check how much open pipeline is payment-ready:

```sh
node tools/payment-readiness.js \
  --stripe-offer-map stripe-offer-map-YYYY-MM-DD.tsv \
  --pipeline pipeline-status-YYYY-MM-DD.tsv \
  --out payment-readiness-YYYY-MM-DD.md
```

Check whether the current payment-ready pipeline can hit the after-tax target:

```sh
node tools/close-target-plan.js \
  --pipeline pipeline-status-YYYY-MM-DD.tsv \
  --prospects prospects-YYYY-MM-DD.tsv \
  --stripe-offer-map stripe-offer-map-YYYY-MM-DD.tsv \
  --out close-target-plan-YYYY-MM-DD.md
```

The daily aggregate shortcut is:

```sh
node tools/revenue-command-center.js --date YYYY-MM-DD --limit 10
```

Run the local revenue control suite before publishing public funnel changes or
importing Stripe links:

```sh
node tools/revenue-control-checks.js --date YYYY-MM-DD --limit 10
```

This is not revenue proof. It verifies local controls and still expects cleared
payments to be recorded separately.

Check that the public repo still exposes the paid path and safety boundaries:

```sh
node tools/public-conversion-check.js
```

The public `docs/prospects.example.tsv` is synthetic. Real prospect/contact data belongs in a private ignored file.

The public `docs/pipeline-status.example.tsv` is synthetic. Real sent/replied/booked/proposed/paid/lost outcomes belong in a private ignored file. `paid` stage is not revenue proof by itself; cleared payments still need to be entered into the private revenue ledger and verified with `tools/revenue-net.js`.

## Revenue Ledger

Use a private ledger or CRM, not this public repo, for buyer names and payment records. Real TSV ledgers matching `revenue-ledger*.tsv` are gitignored; `docs/revenue-ledger.example.tsv` is public example data only.

Required fields:

| Field | Why it matters |
|---|---|
| Date paid | Proves revenue timing. |
| Buyer segment | Shows which segment converts. |
| Source | Separates GitHub, Cal.com, direct outreach, and referrals. |
| Offer | Shows diagnostic vs sprint vs partner mix. |
| Gross amount | Starts the target calculation. |
| Stripe fee | Needed for real net. |
| Tax reserve | Keeps after-tax math honest. |
| Refund/dispute status | Prevents false revenue claims. |
| Proof delivered | Connects revenue to actual hardening work. |

## Revenue Verification

Use the verifier before claiming the target:

```sh
node tools/revenue-net.js docs/revenue-ledger.example.tsv --from 2026-06-01 --to 2026-06-30 --days 30
```

The example ledger is synthetic and should report `Target status: MET` only to demonstrate the math. For real revenue, run the same command against a private ignored ledger populated from cleared Stripe payments.

Completion rule:

- `Target status: MET` on a private ledger.
- At least 30 days in the measured window unless a different tax/accounting window is explicitly documented.
- Refunds and disputes included.
- Stripe fees included.
- Tax reserve included.
- No buyer names or payment records committed to the public repo.

## Stop Conditions

Revise the offer if any of these happen for two consecutive weeks:

- Fewer than 5 qualified replies from 100 targeted messages.
- More than 10 qualified calls but zero paid diagnostics.
- Buyers understand the Mac guard but not ThumbGate's repeated-mistake value.
- Buyers want security/compliance proof that the current artifacts do not provide.
