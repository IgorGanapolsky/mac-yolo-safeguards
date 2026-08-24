---
name: agent-harness-router
description: >
  Agent harness router consolidating TrueFoundry TrueForge (harness as control point,
  $10/mo budget enforcement), Martech (scattered AI discovery capture), GLM-5.3
  (private benchmark validation, model portability), and Futurism (ChatGPT Computer
  History fail-closed alternative). Routes model calls by cost/latency/quality/privacy,
  tracks spend against hard cap, captures reusable prompt patterns, validates models
  on private benchmarks. Never captures keystrokes, clicks, or local Mac activity.
tags:
  - model-routing
  - budget-enforcement
  - discovery-capture
  - benchmark
  - privacy
license: MIT
owner: claude-code
version: 1.0.0
---

## Trigger
Any agent task involving model selection, cost optimization, budget enforcement,
discovery capture of AI patterns, or private benchmark validation.

## Usage

```bash
# Route a task to the best model (cost/latency/quality/privacy/balance)
node tools/agent-harness-router.js route '{"requiresTools":true,"category":"coding","preference":"quality"}'

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

## Architecture
- **MODEL_REGISTRY**: 9 models with cost/latency/quality/privacy metadata
- **routeModel()**: Optimal model for a task based on 5 routing preferences
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
