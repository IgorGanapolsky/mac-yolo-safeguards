---
name: nvidia-nemo-switchyard-engine
description: NVIDIA Nemotron 3.5 Lightning & NeMo Switchyard Engine (30B MoE / 3B active parameters, step-level agentic routing, 77% cost reduction & 70% latency speedup) for all coding agents on Igor's Mac.
trigger: ["nvidia", "nemotron", "switchyard", "skill-evaluator", "nemo", "step-router"]
---

# NVIDIA NeMo Switchyard & SkillEvaluator Performance Engine

Steals the top high-ROI breakthroughs from NVIDIA Developer News (August 20, 2026):

1. **Step-Level Dynamic NeMo Switchyard**:
   - Routes each turn to its specialist (Nemotron 3.5 Lightning for high-throughput tool calling at 250 TPS, Qwen 3.8 Max for complex planning, Local Ollama for test assertions).
   - Achieves $77\%+$ token cost reduction and $70\%$ latency acceleration compared to pinning monolithic frontier models.

2. **NVIDIA SkillEvaluator Benchmark Engine**:
   - Evaluates agent skill trigger precision, recall, and F1 score.
   - Evaluates context footprint density, preventing bloated instructions.
   - Detects trigger collisions across the skill catalog.

## CLI Usage

```bash
# Run tests
node tests/test-nvidia-agent-evaluator-and-switchyard.js

# Test switchyard router & skill evaluator
node tools/nvidia-nemo-switchyard.js
node tools/nvidia-skill-evaluator.js
```
