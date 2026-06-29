---
title: git-reset-hard
type: gate
action: block
tool: "Bash:git_reset_hard"
pattern: "(?:^|[;&|]\\s*)git\\s+reset\\s+--hard\\b"
severity: critical
layer: Execution
---

# Gate: git-reset-hard

## Description

git reset --hard is blocked because it can destroy uncommitted work. Stash or use a non-destructive restore path with explicit user approval.

## Match Conditions

- **Pattern**: `(?:^|[;&|]\s*)git\s+reset\s+--hard\b`
- **Layer**: Execution

## Enforcement

- **Action**: block
- **Severity**: critical
