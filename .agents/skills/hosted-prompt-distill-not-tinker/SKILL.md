---
name: hosted-prompt-distill-not-tinker
description: >
  Tinker cookbook prompt-distillation analog for thumbgate.app hosted VPS:
  strip long operator skill dumps without a training API; hosted completed
  is not quality. Do not clone Tinker, Inkling, DPO/RL, or switch hermes-yolo.
  Trigger: thinking-machines-lab/tinker, hosted prompt distill, completed ≠
  quality, TINKER-DEPLOY-OK analog. Slash: /hosted-prompt-distill-not-tinker.
---

# Hosted prompt-distill — not Tinker

They: cloud LoRA training API; cookbook trains a student **without** prompt `p`.
We: $10/mo hosted Hermes on a fenced VPS. Complementary to `/tinker-compare-not-clone`
(hermes-yolo sidecar) and grok PR #2026. Do **not** dual-edit those files.

```bash
bin/hosted-prompt-distill --doctor --json
node tools/hosted-prompt-distill.js --distill --system-file FILE --json
node apps/hermes-control-plane/tests/hosted-prompt-distill.test.mjs
```

## Steal

1. **Prompt distillation shape** — student runs without the 30–60k skill dump.
2. **Holdout honesty** — `completed` is lifecycle. TINKER-DEPLOY-OK analog.
3. **Host executes tools** — models emit calls; the VPS dispatcher runs them.

## NEVER / ALWAYS

| NEVER | ALWAYS |
| --- | --- |
| Clone Tinker / Inkling / DPO / RL | $0 trim + refuse customer traces |
| Overwrite teacher `conversations.jsonl` | Sidecar / stdout only |
| Train on hosted customer runs | `TRAIN_ON_CUSTOMER_RUNS=false` |
| Treat hosted `completed` as quality | `gradeHostedTask` + holdout |
| Dual-edit PR #2026 or AGENT-455 connector | Complementary helper only |
| Pitch $499 / paid Tinker train as a SKU | Hosted VPS $10 chat |

## Related

`apps/hermes-control-plane/lib/hosted-prompt-distill.mjs` · `hosted-primitives.mjs` · `/tinker-compare-not-clone`
