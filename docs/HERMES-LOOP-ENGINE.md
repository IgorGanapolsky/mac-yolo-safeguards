# Hermes Loop Engine

Hermes should not wait for repeated "continue" prompts. It should run a small,
auditable loop:

1. Observe the event.
2. Load the task graph.
3. Pick no more than five executable actions.
4. Execute one bounded action.
5. Verify with external truth.
6. Append evidence.
7. Schedule the next event or stop.

This is the local implementation of the high-ROI patterns from Tasklet-style
agent responsibilities, OpenAI/Codex delegated work, Beads-style task graphs,
and CodeRabbit loop engineering.

## Files

- `tools/hermes-loop-engine.js`
- `tests/test-hermes-loop-engine.js`

The tool is dependency-free and read-only unless `--state-file` or `--out` is
explicitly supplied.

## Responsibility Registry

The default registry separates duties:

| Responsibility | Owns | Forbidden |
| --- | --- | --- |
| Hermes Revenue Orchestrator | buyer signals, qualification, follow-ups, checkout scope, delivery packaging | client code changes, PR merges, production deploys, unapproved pricing |
| Codex Technical Fulfillment Worker | repo exploration, reproduction, tests, patches, reports | customer contact, Stripe, scope expansion |
| ThumbGate Boundary | approvals, denials, remembered blocks, risk feedback | approving without action IDs |
| Verifier | CI, payment truth, gateway health, delivery evidence | accepting self-reported success |

## Task Schema

```json
{
  "id": "answer_interested_buyer",
  "lane": "buyer_reply",
  "status": "ready",
  "owner": "revenue-orchestrator",
  "priority": 90,
  "revenue_impact": 9,
  "urgency": 8,
  "confidence": 7,
  "cost_risk": 1,
  "retry_count": 0,
  "retry_limit": 3,
  "cost_cap_usd": 2,
  "approval_required": true,
  "next_action": "Draft one buyer-specific reply and request diagnostic assets only when offer fit is explicit.",
  "verifier": {
    "type": "ledger",
    "command": "node tools/send-next.js"
  },
  "evidence": []
}
```

## Event Mapping

| Event | Preferred lane |
| --- | --- |
| `PAYMENT_SUCCEEDED` | `paid_fulfillment` |
| `CODEX_JOB_COMPLETED` | `paid_fulfillment` |
| `NEW_REPLY` | `buyer_reply` |
| `ASSETS_RECEIVED` | `assets_received` |
| `DELIVERY_DUE` | `paid_fulfillment` |
| `FOLLOWUP_DUE` | `warm_followup` |
| `NEW_BUYER_SIGNAL` | `buyer_signal_scan` |
| `THUMBGATE_BLOCKED` | `infrastructure` |
| `CI_FAILED` | `infrastructure` |
| `DAILY_RECONCILIATION` | `payment_request` |

Infrastructure loses priority unless a reproducible blocker is present.

## Commands

Preview the next action:

```bash
node tools/hermes-loop-engine.js next --json
```

Steer by event:

```bash
node tools/hermes-loop-engine.js next --event NEW_REPLY --buyer --json
```

Initialize explicit state outside the repo:

```bash
node tools/hermes-loop-engine.js init --state-file ~/.hermes/loop-state.json --json
```

Append verifier evidence:

```bash
node tools/hermes-loop-engine.js event \
  --state-file ~/.hermes/loop-state.json \
  --type VERIFY_PASS \
  --task fulfill_paid_work \
  --evidence "REPORT.md and RESULT.json created" \
  --json
```

Validate task graph health:

```bash
node tools/hermes-loop-engine.js validate --state-file ~/.hermes/loop-state.json --json
```

## Operating Rules

- One loop run chooses one action.
- Every action has an owner and verifier.
- Paid fulfillment outranks infrastructure.
- Buyer replies outrank new research.
- Approval-required actions stay approval-required.
- Verification failures increment retries; after retry limit, the task blocks.
- No command here sends messages, creates checkouts, deploys, merges, or charges.

## Why This Matters

This converts "make money" into a bounded operating primitive. Hermes can stop
chat-looping, Codex can stop guessing priorities, and ThumbGate can see exactly
which task/action/evidence pair is being approved or rejected.
