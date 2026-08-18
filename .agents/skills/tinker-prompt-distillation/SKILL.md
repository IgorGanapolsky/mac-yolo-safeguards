---
name: tinker-prompt-distillation
description: Thinking Machines Tinker Prompt Distillation & Continual Learning Engine. Harvests production traces, distills long system prompts into compact local models, and exports SFT/DPO datasets.
---

# Thinking Machines Tinker Prompt Distillation Skill

Implements the core continual post-training & distillation architecture from Thinking Machines Lab (thinkingmachines.ai - August 2026):
1. **Production Trace Harvester**: Continuously ingests successful execution receipts and DPO pairs from ThumbGate.
2. **Prompt Distillation Pipeline**: Compresses multi-shot instructions into high-density local agent templates, achieving frontier performance on $0 local models.
3. **Continual Learning (SDFT) Dataset Generator**: Formats training pairs ready for Supervised Distillation Fine-Tuning and Tinker API fine-tuning runs.

## Global System Commands

- **`bin/tinker-distill --doctor`**: Probes the distillation state, total traces ingested, and dataset locations.
- **`bin/tinker-distill --export-sft`**: Exports all production interaction receipts into `~/.hermes/tinker/sft_traces.jsonl`.

## Verification

```bash
# Doctor Status Check
bin/tinker-distill --doctor

# Run Automated Test Suite
node tests/test-tinker-distillation-engine.js

# Export SFT Dataset
bin/tinker-distill --export-sft
```
