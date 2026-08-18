---
name: lorebook-triggered-context
description: SillyTavern-Style Triggered Lorebook & Persona Character Card Engine. Injects domain context lazily based on trigger keywords (>85% token savings) and manages hyperparameter-tuned agent personas.
---

# Triggered Lorebook & Persona Card Skill

Implements SillyTavern's power-user architecture (MakeUseOf Aug 2026):
1. **Trigger-Based Lorebooks**: Domain facts and operational invariants are stored in indexed lorebooks and injected **only** when trigger keywords appear in the prompt or diff, cutting context token bloat by >85%.
2. **Persona Character Cards**: Configurable personas with sampling hyperparameters (`temperature`, `minP`, `topK`).
3. **Macro Template Interpolation**: Dynamic macro replacement (`{{guardian}}`, `{{branch}}`, `{{cost}}`).

## Global Commands

- **`bin/lorebook --doctor`**: Probes lorebook readiness, active entries, and personas.
- **`bin/lorebook --query "<text>"`**: Evaluates prompt against keyword triggers and extracts matched lore.
- **`bin/lorebook --persona <id>`**: Prints persona sampling hyperparameters and system prompts.

## Verification

```bash
# Doctor Status Check
bin/lorebook --doctor

# Run Automated Test Suite
node tests/test-lorebook-context-engine.js

# Test Query
bin/lorebook --query "how do we handle stripe subscriptions"
```
