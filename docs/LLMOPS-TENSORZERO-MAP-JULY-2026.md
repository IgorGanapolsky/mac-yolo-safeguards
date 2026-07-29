# TensorZero → Hermes LLMOps map (July 2026)

**Source:** [Dan Kornas on X](https://x.com/DanKornas/status/2080976597536870529) summarizing
[TensorZero](https://github.com/tensorzero/tensorzero) (Apache-2.0; **GitHub archived/read-only**).

We do **not** vendor archived TensorZero. We implement the same closed loop with Hermes tools.

## How it improves the harness & workflow

| TensorZero pillar | Before (fragmented) | After (unified CLI) |
|-------------------|---------------------|---------------------|
| Gateway | LiteLLM on Pro/mini, docs scattered | `llmops doctor/fleet` probes both hosts |
| Observability | Economic receipts, ThumbGate, chat | `~/.hermes/llmops/{inferences,feedback}.jsonl` same schema dual-host |
| Evaluation | eval-mine/check exist but manual | `close-loop` always runs mine + check |
| Optimization | Propose-eval ad hoc | Down feedback notes → `propose-eval` |
| Experimentation | ml-experiment alone | Documented in map + fleet report |

**Workflow change:** after multi-host agent work, run:

```bash
node tools/llmops-lifecycle.js fleet --sync-mini --json
node tools/llmops-lifecycle.js close-loop --json
```

Do not treat Mac Pro chat as the coordination bus — plan.md + llmops store + dual doctor.

## Commands

```bash
node tools/llmops-lifecycle.js map
node tools/llmops-lifecycle.js doctor --json
node tools/llmops-lifecycle.js fleet --sync-mini --json   # Pro + mini
node tools/llmops-lifecycle.js record-inference --body-file inf.json
node tools/llmops-lifecycle.js record-feedback --inference-id … --signal down --note "…"
node tools/llmops-lifecycle.js close-loop [--write-evals]
node tools/llmops-lifecycle.js report --json
```

Env: `HERMES_LITELLM_URL` (default `http://127.0.0.1:4010`), `HERMES_MINI_SSH` (default `igorganapolsky@100.94.135.78`).

## Dual-host notes (Pro + mini)

| Host | Role | Doctor expectation |
|------|------|--------------------|
| Mac Pro | primary | full: gateway + eval-check + ml-gate when present |
| Mac mini | secondary | gateway hard; eval soft if clone dirty/behind (no force-pull) |

`fleet --sync-mini` scp's `tools/llmops-lifecycle.js` only. It never force-resets mini WIP
(`plan.md`, local harness edits). When mini reports `harness_lagging`, pull `origin/main`
on mini once the working tree is clean.

## Tests

```bash
node tests/test-llmops-lifecycle.js
# dual-host (requires Tailscale SSH to mini)
node tools/llmops-lifecycle.js fleet --sync-mini --json
```
