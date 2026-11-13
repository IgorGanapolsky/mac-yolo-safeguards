---
name: egm-fresh-review
description: Refuse a Goldfish review that the same context graded. Require a different reviewer, ranked findings, and at most one re-audit before a fix or ship claim counts.
---

# Fresh-context review

Use this before treating a fix, a ship claim, or a design as reviewed.

Source: https://github.com/google/elephant-goldfish-model

A review in the same context is not a Goldfish review. If this harness cannot spawn a fresh subagent, stop. Do not call the result a Goldfish review.

## What this gate does

- `isolation` must be `fresh`.
- `reviewerAgentId` and `parentSessionId` must both be set, and they must differ.
- `mode` is `full` (stages 5–9), `feature_spec` (5–8), `implementation` (9), or `claim` (9).
- `reauditCount` is 0 or 1.
- An open blocker or an open major fails the receipt. An open nit does not.
- The gate does not call a model.

## Commands

```bash
node tools/egm-fresh-review-gate.js
node tools/egm-fresh-review-gate.js --review receipt.json
node tests/test-egm-fresh-review-gate.js
```

Write the receipt only after the fresh reviewer returns. Put the reviewer's evidence in `findings`, not a paraphrase from the parent.
