# Hermes Economic Router

The economic router turns Hermes model/tool selection into a receipt-producing
decision instead of a hidden default. It implements the high-ROI part of the
agentic-commerce and multi-agent-pipeline research: specialized agents,
explicit budgets, proof gates, and route receipts.

It does **not** move money, call wallets, publish posts, or invoke paid models.
It chooses a route and emits the gates required before a runtime wrapper should
act.

## Why Qwen Is The Default

`qwen2.5:3b-64k` is the routine local route because it is free, fast, available
through local Ollama, and proven by the Hermes YOLO smoke path. That is the
right default for low/medium-risk work: local tests, exact-marker smokes,
small code edits, and cheap diagnostics.

GLM 5.2 is still configured as a higher-reasoning option. It should win when
the task is high-risk, cross-file, architecture-heavy, or when the user is
explicitly challenging certainty. It must also pass budget and paid-provider
gates.

## Route Classes

| Route | Provider/model | Use when | Gate |
|---|---|---|---|
| `local_fast` | `custom:ollama-local-64k` / `qwen2.5:3b-64k` | routine local work, smokes, cheap diagnostics | exact marker or focused test |
| `local_coder_candidate` | local coding candidate such as Ornith | benchmark new coding models | benchmark before default |
| `glm52_reasoning` | `custom:zai-coding-glm` / `glm-5.2` | high-risk reasoning, architecture, "are you sure?" loops | paid OK, cost cap, provider smoke |
| `fugu_escalation` | OpenRouter `sakana/fugu-ultra` | rare hard multi-agent research/review | explicit approval and cost cap |
| `mobile_e2e_gate` | local tests + Maestro | Hermes Mobile release/user proof | file ownership, unit tests, latest E2E proof |

## Command

```sh
node tools/hermes-economic-router.js \
  --task "are you sure? use GLM 5.2 for cross-file architecture debugging" \
  --risk high \
  --max-cost-usd 0.10 \
  --latency-ms 30000 \
  --paid-ok \
  --json
```

Use `--write` to append a private JSONL receipt to:

```text
~/.hermes/economic-router-receipts.jsonl
```

Receipts include:

- selected route
- rejected routes and reasons
- cost and latency estimates
- model/provider environment hints
- pipeline stages
- approval requirements
- proof gates

## Policy

- Routine Hermes CLI and YOLO work stays local-first.
- Paid routes need explicit `--paid-ok` plus a cost cap.
- Wallet, stablecoin, Stripe, send, post, publish, and external-action tasks
  only emit an approval gate. The router never executes them.
- Ornith and other new coding models are candidates until benchmark receipts
  prove they beat the current local route.
- Mobile release claims stay separate from CLI/model routing; they route to
  the E2E verifier.
