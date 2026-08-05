# Inference Engineering — Hermes Fleet Playbook

**Goal:** treat inference as its own product surface (Latent Space / Baseten framing), not “just call an API.”

This repo’s control plane lives under `tools/inference-eng/`.

## 1. Task decomposition

Canonical tasks: `node tools/inference-eng/task-registry.js --list`

Each task has: input/output shape, latency budget, quality floor, concurrency pattern, preferred model chain, and a **business KPI**.

Classify free text:

```bash
node tools/inference-eng/task-registry.js --classify "fix the auth bug" --json
```

## 2. Inference stack (what we run)

| Layer | Role |
|-------|------|
| SuperGrok / `grok-yolo` | Interactive frontier agent (OAuth plan) |
| LiteLLM `:4010` | Multi-model OpenAI-compatible gateway |
| Ollama / hermes-local | Offline / emergency |
| `hermes-yolo` wrapper | Backend selection + fail-closed agent_capable |

We **consume** provider inference (speculation/quant/KV routing on their side when available). We **own** task routing, degradation, metrics, and optimization loops.

### Provider feature checklist (turn on when available)

- Speculative decoding / multi-token prediction for long-form `draft`
- Quantized variants for high-throughput `classify` / `smoke`
- Prefix reuse: keep stable system/soul prompts so cache-aware routing hits
- Separate prefill-heavy (huge context retrieve) from decode-heavy chat

## 3. Metrics

```bash
node tools/inference-eng/metrics.js --window-hours 24 --json
```

Per request we derive: `taskId`, `tokensPerSec`, `ttftProxyS` (prefill proxy until true TTFT is logged), `costUsd`, `withinBudget`.

Traffic source: `~/.hermes/litellm-logs/traffic.jsonl`.

## 4–5. Degradation + multi-step pipelines

```bash
node tools/inference-eng/degradation.js --task "fix login" --mode normal --json
node tools/inference-eng/pipeline.js --name coding-fix --json
node tools/inference-eng/pipeline.js --list
```

Modes: `normal` | `degraded` | `emergency`  
Auto-infer: `HERMES_INFERENCE_MODE` or swap/fail signals via `inferMode()`.

Pipelines: `coding-fix`, `content-factory`, `lead-qualify`, `mobile-qa`, `smoke`.

## 6. Optimizer loop

```bash
node tools/inference-eng/optimizer.js --window-hours 168 --json
```

Emits proposals (remap primary, degrade mode, drop non-tool models) + A/B hint (10% traffic / 24h). **Does not auto-mutate production.**

## 7. Business KPIs

Every task and pipeline names a KPI (`ship_cycle_time_hours`, `lead_qualify_precision`, etc.). Scorecard pillar 7 fails if any KPI is missing.

## Scorecard (A+ gate) — design / control plane

```bash
node tools/inference-eng/scorecard.js
node tools/inference-eng/scorecard.js --json --gate
```

Requires all pillars pass and average ≥ 9.5 → **A+ / 10/10**.

## Fleet health — live traffic (separate grade)

```bash
node tools/inference-eng/fleet-health.js
node tools/inference-eng/fleet-health.js --json --gate --floor 0.5
```

This grades **real** `traffic.jsonl` success rate (not the design scorecard).  
A failing fleet can coexist with an A+ control plane.

| Env | Meaning |
|-----|---------|
| `HERMES_YOLO_BACKEND=grok` | Force SuperGrok interactive path |
| `HERMES_INFERENCE_MODE=degraded` | Skip frontier in litellm chains until paid routes recover |

## Operator env

| Variable | Meaning |
|----------|---------|
| `HERMES_INFERENCE_MODE` | `normal` / `degraded` / `emergency` |
| `HERMES_YOLO_MODEL` | Force primary model (head of chain) |
| `HERMES_YOLO_BACKEND` | `auto` / `grok` / `hermes` |
