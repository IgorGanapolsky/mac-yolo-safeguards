---
name: pr-hygiene-triage
description: >
  Autonomous multi-agent PR queue classification, dirty conflict identification,
  superseded draft cleanup, and sequential rebase scheduler.
  Trigger: pr hygiene, triage prs, conflicting branches, auto-merge audit,
  pr queue, rebase queue.
---

# Multi-Agent PR Hygiene & Triage Engine

## Purpose

Automates the **PR hygiene session pattern (2026-08-17)** from `AGENTS.md`. Classifies all open PRs in the repository into Clean/Mergeable, Conflicting (needs rebase), Superseded Draft Logs, and Dependabot updates.

```mermaid
flowchart LR
    A[Open PRs Queue] --> B{PR Hygiene Engine}
    B -->|Clean & Green| C[Phase 1: Squash Auto-Merge]
    B -->|Superseded Drafts| D[Phase 2: Archive Draft Logs]
    B -->|Conflicting on plan/skills| E[Phase 3: Sequential Rebase]
```

## Verification Commands

```bash
# Run PR triage audit
node tools/pr-hygiene-engine.js

# Run test suite
node tests/test-pr-hygiene-engine.js
```
