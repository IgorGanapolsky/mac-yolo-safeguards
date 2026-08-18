---
name: qoder-agent-harness
description: Qoder-Style Autonomous Agent Harness & Convergence Engine. Implements pre-turn snapshot/rollback recovery, parallel sub-agent task decomposition, and loop convergence guards.
---

# Qoder Agent Harness & Convergence Skill

Implements the battle-tested Qoder Agent SDK architecture (Alibaba / Qoder Aug 2026):
1. **Snapshot & Rollback Recovery**: Takes pre-turn snapshots of touched files so broken turns can be cleanly rolled back to a green checkpoint.
2. **Sub-Agent Task Decomposition**: Automatically splits complex multi-stage tasks into ordered sub-agent goals.
3. **Loop Convergence Guard**: Protects against runaway tool calling loops and caps consecutive failure streaks at 3 with targeted diff repairs.

## Global System Commands

- **`bin/qoder-harness --doctor`**: Probes harness status, snapshot counts, and convergence limits.
- **`bin/qoder-harness --decompose "<prompt>"`**: Decomposes a multi-step instruction into isolated sub-agent goals.
- **`bin/qoder-harness --snapshot`**: Creates a state snapshot before executing high-risk mutations.

## Verification

```bash
# Doctor Status Check
bin/qoder-harness --doctor

# Run Automated Test Suite
node tests/test-qoder-agent-harness.js

# Decompose Multi-Step Task
bin/qoder-harness --decompose "refactor auth, apply migrations, and run tests"
```
