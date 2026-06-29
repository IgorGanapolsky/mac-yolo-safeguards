---
title: local-only-git-writes
type: gate
action: block
tool: any
pattern: "^(git\\s+(add|commit|push|tag)|gh\\s+pr\\s+|gh\\s+release\\s+create|npm\\s+publish|yarn\\s+publish|pnpm\\s+publish)"
severity: critical
layer: Identity
---

# Gate: local-only-git-writes

## Description

User requested local-only work. Git writes, PR operations, and release actions are blocked.

## Match Conditions

- **Pattern**: `^(git\s+(add|commit|push|tag)|gh\s+pr\s+|gh\s+release\s+create|npm\s+publish|yarn\s+publish|pnpm\s+publish)`
- **Layer**: Identity

## Enforcement

- **Action**: block
- **Severity**: critical
