# Reflection AI & Open-Weight Intelligence Strategy (Synthesis)

Based on Misha Laskin's framework and the podcast insights, this document maps out our architecture for owning the intelligence layer via open weights, scaling reinforcement learning, and orchestrating multi-agent loops.

## 1. Core Architectural Pillars
- **Open-Weight Foundation as Commodity & Leverage**: Base LLMs are treated as replaceable commodities. Value is captured in the RL fine-tuning loops, evaluation harness, task-specific verifiers, and agentic wrappers (e.g., our ThumbGate & Agent-Mesh orchestration).
- **Cascade Routing & SLM Intent Classifiers**: Simple tasks route to local small language models (`Laguna-XS-2.1`, 3B active) for zero-token execution. Complex tasks cascade dynamically to `Laguna-S-2.1` (118B total / 8B active) or frontier cloud models only when confidence scores drop below threshold.
- **Cross-Family Critique Loops**: Generation steps are validated by an independent critic model before execution, cutting token waste by 50%–77% and verifying correctness.

## 2. Implementation in Mac-Yolo & Poolside Harness
- `tools/critique-loop.js`: Automated cross-family validation pipeline.
- `tools/disposable-agent.js`: Ephemeral agent spawning with automated garbage collection.
- vLLM serving configuration with `--moe-backend triton --num-speculative-tokens 7 --tool-call-parser poolside_v1` for 2x DFlash speculative throughput.
