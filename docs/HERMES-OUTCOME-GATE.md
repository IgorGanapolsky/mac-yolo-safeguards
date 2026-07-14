# Hermes Outcome Gate

`hermes-outcome-gate` prevents Hermes from treating a plan or draft as a
completed result. A task passes only when execution and independent
verification both have opaque evidence IDs, delivery has evidence when the
task requires delivery, and measured cost stays within the declared cap.

This is the high-ROI harness improvement supported by the reviewed agent
orchestration material: manage the entire work lifecycle and measure actual
outcomes. It complements the economic router instead of adding another agent
framework.

## Completion contract

| Stage | Pass condition |
|---|---|
| Plan | A private outcome receipt exists for a safe task ID. |
| Execute | Status is `pass` and at least one execution evidence ID exists. |
| Independently verify | Status is `pass` and at least one verification evidence ID exists. |
| Deliver | When required, status is `pass` and a delivery evidence ID exists. |
| Account | Actual duration and cost are recorded; cost does not exceed the cap. |

`fail` means a declared stage failed or cost exceeded the cap. `blocked` means
the evidence is incomplete. Both return exit code 2, so shell automation and CI
cannot silently count them as success.

## Standalone CLI

```sh
hermes-outcome-gate \
  --task-id release-123 \
  --execution-status pass \
  --verification-status pass \
  --delivery-required \
  --delivery-status pass \
  --execution-evidence-id unit-tests-pass \
  --verification-evidence-id independent-e2e-pass \
  --delivery-evidence-id production-receipt \
  --duration-ms 42000 \
  --actual-cost-usd 0.01 \
  --max-cost-usd 0.05 \
  --value-signal customer-visible \
  --write \
  --json
```

The default private artifacts are:

```text
~/.hermes/receipts/outcomes/latest.json
~/.hermes/receipts/outcomes/history.jsonl
```

Directories are mode 0700 and receipt files are mode 0600. Writes to the
latest receipt are atomic.

## Privacy boundary

Task IDs, evidence IDs, and value signals must be 1-80 characters containing
only letters, numbers, dots, underscores, and hyphens. The receipt schema has
no field for task text, prompts, drafts, URLs, model output, customer data, or
credentials. Evidence stays in its owning system; the gate records only an
opaque identifier.

## Hermes integration

`hermes-economic-router` emits an `outcomeContract` with the required stages,
evidence classes, delivery requirement, and cost cap. Its dry-run execution
plan includes independent-verification and final outcome-gate steps without
performing provider calls or external actions.

The two-Mac Grok/Hermes installer exposes both integration commands:

```text
hermes-economic-router
hermes-outcome-gate
```

`hermes-harness-eval` reads the outcome history and adds an outcome funnel:
planned, executed, independently verified, delivery-required, delivered,
completed, incomplete, duration, actual cost, value signals, and failure-stage
clusters. Old route/verifier histories remain valid when no outcome receipts
exist.

## Deliberate non-adoptions

- The existing Obsidian/Markdown vault and ThumbGate RAG already provide shared
  inspectable memory, so this change does not create a second memory graph.
- The Transformers backend for vLLM is valuable on CUDA serving hosts, but it
  is not installed on the Apple Silicon Macs. It remains a future GPU-host
  candidate, not a local Hermes dependency.
- The gate never sends, publishes, deploys, charges, or delivers anything. It
  verifies the evidence from an already-authorized executor.
