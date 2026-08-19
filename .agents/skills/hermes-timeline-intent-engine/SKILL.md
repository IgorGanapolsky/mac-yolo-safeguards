---
name: hermes-timeline-intent-engine
description: >
  Privacy-first local semantic timeline tracking, incomplete task auto-continuation,
  and repetitive workflow skill discovery (stolen and improved from OpenAI macOS Computer History).
  Trigger: computer history, timeline, auto-resume, incomplete tasks, repetitive workflow,
  suggest skill, task continuation.
---

# Hermes Semantic Timeline & Task Continuation Engine

## Purpose & Architecture

Improves upon OpenAI's macOS "Computer History" feature by delivering **100% local, privacy-first workflow tracking and task auto-continuation** without raw keystroke surveillance, cloud fine-tuning leakage, or unencrypted storage risks.

```mermaid
flowchart TD
    A[macOS Developer Activity] --> B[Semantic Intent Redaction Filter]
    B -->|Strip Secrets, Passwords, Tokens| C[Local WAL Timeline JSONL]
    C --> D{Hermes Analysis Loop}
    D -->|Interrupted Workflow| E[Deterministic Auto-Resume Plan]
    D -->|Repetitive Action Sequences >= 3| F[Proactive Skill Synthesizer]
```

## Core Capabilities

1. **Semantic Event Timeline** (`tools/hermes-timeline-engine.js`):
   - Logs structured workflow events (`git_commit`, `test_run`, `pr_review`, `cli_action`) to local SQLite/JSONL.
   - Zero keystroke logging; automatic scrubbing of bearer tokens, private keys, and API keys.

2. **Incomplete Task Auto-Resume**:
   - Analyzes recent event sequences to isolate started/in-progress tasks that were interrupted.
   - Proposes concrete next-step action plans to complete the work without human babysitting.

3. **Repetitive Workflow Skill Discovery**:
   - Detects repeated manual commands ($\ge 3$ occurrences) and synthesizes suggested repeatable skills.

## Verification Commands

```bash
# Run timeline engine test suite
node tests/test-hermes-timeline-engine.js
```
