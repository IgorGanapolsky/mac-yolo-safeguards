# Revenue Unblock Plan - 2026-06-04

Private working file. Do not commit prospect-specific sales state.

## Current Blocker

- Payment waiting audit: payment-waiting-audit-2026-06-02.md
- Proposal batch: proposal-batch-plan-2026-06-04.md
- Selected payment requests expected: 10
- Selected payment requests waiting for Stripe: 0
- Selected send confirmations missing: 10
- Selected missing-send gross blocked: $15000.00
- Selected missing-send estimated net blocked: $9465.30
- Ledger revenue proof: NOT PROVEN HERE; use `node tools/revenue-goal-audit.js --date 2026-06-04` after cleared payments are recorded.

## Risk Model

- Monthly net target: $9000.00 ($300.00/day over 30 days)
- Hardening Sprint estimated net per clear: $946.53
- Hardening Sprint clears needed: 10
- Partner Pilot estimated net per clear: $1893.26
- Partner Pilot clears needed: 5
- Link-ready Hardening Sprint rows available now: 11
- Link-ready Hardening Sprint backups outside selected batch: 1
- Link-ready Partner Pilot rows available now: 0

| Path | Payment requests available | Clears needed | Assumed clear rate | Probability of hitting target |
|---|---:|---:|---:|---:|
| Current selected Hardening Sprint batch | 10 | 10 | 30% | 0.00% |
| Current selected Hardening Sprint batch | 10 | 10 | 50% | 0.10% |
| Current selected Hardening Sprint batch | 10 | 10 | 70% | 2.82% |
| Current selected Hardening Sprint batch | 10 | 10 | 80% | 10.74% |
| All current link-ready Hardening Sprint rows | 11 | 10 | 30% | 0.00% |
| All current link-ready Hardening Sprint rows | 11 | 10 | 50% | 0.59% |
| All current link-ready Hardening Sprint rows | 11 | 10 | 70% | 11.30% |
| All current link-ready Hardening Sprint rows | 11 | 10 | 80% | 32.21% |
| Desired buffered Hardening Sprint batch | 15 | 10 | 30% | 0.37% |
| Desired buffered Hardening Sprint batch | 15 | 10 | 50% | 15.09% |
| Desired buffered Hardening Sprint batch | 15 | 10 | 70% | 72.16% |
| Desired buffered Hardening Sprint batch | 15 | 10 | 80% | 93.89% |
| Partner Pilot after link unlock | 10 | 5 | 30% | 15.03% |
| Partner Pilot after link unlock | 10 | 5 | 50% | 62.30% |
| Partner Pilot after link unlock | 10 | 5 | 70% | 95.27% |
| Partner Pilot after link unlock | 10 | 5 | 80% | 99.36% |

## Unblock Decision

1. Send and confirm the selected payment requests first. They are already copy-ready and represent the fastest collectable gross.
2. Include the 1 available Hardening Sprint backup row(s) so one lost selected close does not break the target.
3. Unblock the Partner Pilot Stripe link. This is the only current way to escape the 10-clear Hardening Sprint requirement with existing pipeline volume.

## Hardening Sprint Backup Inventory

| Prospect | Stage | Next action | Gross | Estimated net | Pipeline |
|---|---|---|---:|---:|---|
| metro-mcp | ready | submit_booking_form | $1500.00 | $946.53 | pipeline-status-mac-yolo-2026-06-02.tsv |

## Constraint To Avoid Over-Claiming

The desired 15-request Hardening Sprint buffer is not currently available. Current link-ready inventory is 11, so the shortfall is 4 additional link-ready Hardening Sprint row(s).

## Exact Next Commands

```sh
node tools/payment-waiting-audit.js --date 2026-06-04 --proposal-batch proposal-batch-plan-2026-06-04.md --out payment-waiting-audit-2026-06-04.md
node tools/proposal-batch-plan.js --date 2026-06-04 --close-plan close-target-plan-2026-06-04.md --include-backup --out proposal-batch-plan-with-backup-2026-06-04.md
node tools/partner-pilot-stripe-unlock-packet.js --date 2026-06-04
node tools/stripe-setup-plan.js --date 2026-06-04
node tools/revenue-goal-audit.js --date 2026-06-04
```

This plan is not revenue proof. It is a conversion-risk reduction plan. Only cleared Stripe payments entered into a private ignored revenue ledger count.
