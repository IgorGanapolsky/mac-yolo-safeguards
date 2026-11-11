---
name: dual-model-agentic-graphrag
description: Operationalizes the 3-Pillar Dual-Model Mixture-of-Agents & Agentic GraphRAG Playbook (Gemini 1M Strategist + Claude 200k Tactical Executor Split Workflow, Loop Memory Model, Schema-Constrained & Graph-R1 Hypergraphs with Rethink traversal, and Bifrost/LiteLLM/Portkey Cross-Provider Parity Routing with Rigid Schema Validation & 3-Hop Token Cap).
---

# Dual-Model Mixture-of-Agents & Agentic GraphRAG Playbook

## When to Use
Invoke this skill whenever:
- Coordinating **Gemini Series** (`4 Argon` / `3.1 Pro`, 1M shared token buffer) as **The Strategist / Global Ingester** with **Claude Series** (`Opus 4.7` / `3.5 Sonnet`, 200k+ high-density tokens) as **The Tactical Executor** via the **Split Workflow** pattern.
- Recording multi-run developer states, commits, and agent findings into **Volodymyr Pavlyshyn's Loop Memory Model** (`~/.mac-yolo-safeguards/graphrag/loop-memory-graph.json`).
- Running **Agentic GraphRAG** with **Pattern B (Schema-Constrained Ontology)** and **Pattern C (Graph-R1 Hypergraphs)** with Format + F1 reward scoring and iterative `rethink` states.
- Enforcing **Dual-LLM Gateway Governance** (`Bifrost` / `LiteLLM` / `Portkey` profiles):
  1. **Cross-Provider Parity Routing** (never fail over to a secondary region of the same provider).
  2. **Rigid Structural Schema Validation** (unparseable JSON or missing schema fields trigger an immediate `LOGICAL_TIMEOUT` failover).
  3. **Token-Throttling Guardrails** (`MAX_FALLBACK_HOPS = 3` and `$10/mo` token budget cap).

## CLI Commands

```bash
# Run full 3-pillar self-test (JSON or human output)
node tools/agentic-graphrag-hypergraph-engine.js --self-test
node tools/agentic-graphrag-hypergraph-engine.js --self-test --json

# Run Agentic GraphRAG Search Tier with Graph-R1 Rethink expansion & cited context output
node tools/agentic-graphrag-hypergraph-engine.js --query "prevent BTM background notification and duplicate HUD windows"

# Generate a Strategist -> Executor Split-Workflow Handoff Packet
node tools/agentic-graphrag-hypergraph-engine.js --split-handoff "Refactor HUD telemetry and verify anti-regression gate"

# Run the behavioral test suite
node tests/test-agentic-graphrag-hypergraph-engine.js
```
