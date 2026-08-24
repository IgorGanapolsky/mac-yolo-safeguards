---
name: tinker-compare-not-clone
description: >
  Thinking Machines Tinker is a cloud LoRA training API, not a hermes-yolo
  inference backend. Steal prompt distillation + holdout eval honesty. Do not
  rebuild Tinker, Inkling, DPO/RL, or switch the hermes-yolo default route.
  Trigger: thinking-machines-lab/tinker, tinker-cookbook, prompt distillation,
  tinker-yolo, qwen3-hermes-tinker, Inkling. Slash: /tinker-compare-not-clone.
---

# Tinker = training API, not hermes-yolo

They: CPU-side `forward_backward` / `optim_step` / `sample`; LoRA 1B–1T; cookbook SFT, DPO, GRPO, tool-use RL, **prompt distillation**.
We: `hermes-yolo` (Grok 4.5 / GLM via LiteLLM). `tinker-yolo` already LoRA-trains `Qwen/Qwen3-8B` off-box and imports `qwen3-hermes-tinker:q4` for **local** cheap leaves.

## Steal (hermes-yolo)

1. **Prompt distillation** — teacher traces already exist (`tinker-yolo build` from LiteLLM traffic). The live JSONL still trains on 30–60k-char skill dumps. Strip them:
   ```bash
   tinker-yolo prompt-distill --json
   tinker-yolo prompt-distill --write --json
   ```
   Sidecar is `prompt-distill.jsonl`. Never overwrite `conversations.jsonl`. Paid `train`/`deploy` still need `--approve-paid --approve-data-upload --max-cost-usd N`.
2. **Holdout, not smoke** — `TINKER-DEPLOY-OK` is not quality. Repeated holdout vs `hermes-local-baseline` stays the promotion gate (`docs` in hermes-eval `TINKER-SETUP.md`).
3. **Local specialist for explicit leaves** — `tinker-yolo` / `qwen3-hermes-tinker:q4` after AC is locked. Frontier stays on `hermes-yolo`.

## Never

- Treat Tinker/`tinker-yolo ask` Inkling as the hermes-yolo default
- Download Inkling (975B) onto a 24 GB Mac
- DPO/RL on vague thumbs (`TINKER-SETUP.md`: not next)
- Upload traces without the paid+data-upload gates
- Claim Grok-backed hermes-yolo sessions are in the Tinker set (route receipts have no messages)

## Related

`tinker-yolo` · `tools/hermes-yolo-tinker-prompt-distill.js` · `/operate-hermes-model-gateway`
