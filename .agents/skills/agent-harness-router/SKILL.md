---
name: agent-harness-router
description: >
  Agent harness router consolidating TrueFoundry TrueForge (harness as control point,
  $10/mo budget enforcement), Martech (scattered AI discovery capture), GLM-5.3
  (private benchmark validation, model portability), and Futurism (ChatGPT Computer
  History fail-closed alternative). Routes model calls by cost/latency/quality/privacy,
  tracks spend against hard cap, captures reusable prompt patterns, validates models
  on private benchmarks. Never captures keystrokes, clicks, or local Mac activity.
license: MIT
---

## Trigger
Any agent task involving model selection, cost optimization, budget enforcement,
discovery capture of AI patterns, or private benchmark validation.

## Usage

```bash
# Route a non-tool task inside latency, quality, and unit-cost budgets
node tools/agent-harness-router.js route '{"category":"coding","performanceBudget":{"maxLatencyMs":500,"minQuality":0.8,"maxCostPer1kUsd":1}}'

# Authorize a proposed tool action. Tool-capable gateway routing must carry the
# resulting action request and fails closed when authority or sandbox proof is absent.
node tools/agent-harness-router.js authorize "$(jq -c . authority-request.json)" --json

# Check current budget + discovery/benchmark stats
node tools/agent-harness-router.js check --json

# Capture a useful prompt/pattern for reuse
node tools/agent-harness-router.js discover "Write a function to sort arrays" --model zai-org/glm-5.3 --task coding --tags utility,beginner

# Private benchmark: add a task, record results, get portability scores
node tools/agent-harness-router.js benchmark add --name "Sort test" --category coding --prompt "Write sort" --expected "sorted"
node tools/agent-harness-router.js benchmark portability

# List all known models
node tools/agent-harness-router.js registry --json
```

## Health Check
```bash
node tools/agent-harness-router.js check --json
# Exit code 0 = budget not exhausted, storage healthy
# Exit code 1 = budget exhausted (fail-closed)
```

## Tool-capable execution

Use `executeRoutedTask(taskSpec, executor)` from
`tools/hermes-gateway-router-bridge.js` for any caller that will actually invoke
a tool-capable executor. `routeForTask()` only selects a route; it executes
nothing.

The authority request must include trusted policy metadata:

- `policy.toolEffects[tool]` is the host-owned `read`, `write`, or
  `consequential` classification. A proposal cannot lower it.
- Write and consequential approvals must contain the exact
  `proposalSha256`; changing arguments, paths, origins, or context invalidates
  the approval.
- The executor is never called when authority or sandbox evidence fails.

## Architecture
- **MODEL_REGISTRY**: 9 models with cost/latency/quality/privacy metadata
- **routeModel()**: Optimal model for a task based on 5 routing preferences
- **authorizeAction()**: Deterministic tool authority with capability, process,
  filesystem, network, sandbox, scoped-approval, and cloud-disclosure checks
- **BudgetGuard**: Fail-closed $10/mo spending cap (per Anti-Babysitting + GLM-5.3)
- **DiscoveryCapture**: Captures useful prompt/task patterns with secret rejection + input-capture refusal
- **PrivateBenchmark**: Validates models on real tasks, computes portability scores
- **ModelRegistry**: isFirstParty/isVerifiedThirdParty/isSafeForSensitiveData classification

## Safety Guarantees
- Never captures keystrokes, clicks, or local Mac activity timelines (Futurism)
- Fail-closed budget enforcement at $10/mo
- Secret detection rejects AWS keys, GitHub PATs, JWTs, Bearer tokens in captured discoveries
- Input-capture detection refuses Computer History / event_tap / keystroke data
- Third-party models blocked when budget exhausted or sensitive data required
- Tool effects come from trusted policy, not a model-provided label
- Mutating approvals are bound to the canonical proposal digest
- No privacy-violating fallback when no model meets the route contract
- Tool-capable gateway routes require a hash-bound deterministic authority receipt
- Cloud advice requires bounded classified context, a matching disclosure digest,
  sensitive-item labels, and explicit action-bound approval
- Latency, minimum-quality, context, and cost-per-1k budgets filter models before scoring
