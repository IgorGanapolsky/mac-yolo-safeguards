---
name: structural-refactoring-engine
description: SWE-Bench ProMax-style Structural AST Refactoring, Concurrency Invariant Sentinel & Zero-Entropy Atomic Rollback Engine
trigger: ["structural-refactor", "swe-bench-promax", "concurrency-sentinel", "atomic-rollback", "race-condition-guard"]
---

# SWE-Bench ProMax Structural Refactoring Engine

Solves the large-scale refactoring bottleneck highlighted in the SWE-Bench ProMax research (ActiveState & SUSE). Moves beyond naive text-diff generation to deterministic AST/LSP code graphs, temporal concurrency invariants, and zero-entropy atomic rollbacks.

## Core Capabilities

1. **Structural AST & Dependency DAG Mapping**: Analyzes blast radius, call graphs, import/export DAGs, and symbol coupling before executing mutations.
2. **Concurrency & Temporal Invariant Sentinel**: Identifies race conditions, non-atomic async operations, un-debounced UI handlers, missing idempotency keys, and retry storms ("where code meets time").
3. **Zero-Entropy Mutation DAG & Atomic Reversibility Gate**: Executes small, discrete AST mutations with byte-exact pre-mutation snapshotting and automatic rollback upon any test regression.
4. **SWE-Bench ProMax 4-Axis Compliance Evaluator**: Scores cross-file coherence, concurrency invariants, reversibility, and blast containment.

## CLI Usage

```bash
# Analyze AST structure and exports
bin/structural-refactor --analyze tools/two-word-primer.js

# Check for concurrency / race hazards
bin/structural-refactor --concurrency-check tools/thumbgate-self-healing-engine.js

# Evaluate SWE-Bench ProMax 4-axis compliance
bin/structural-refactor --benchmark
```
