---
title: protected-branch-push
type: gate
action: block
tool: "Bash:protected_push"
pattern: "git\\s+push\\s+(?:\\S+\\s+)?(?:develop|main|master)\\b"
severity: critical
layer: Execution
---

# Gate: protected-branch-push

## Description

Direct push to protected branch. Use feature branches and PRs.

## Match Conditions

- **Pattern**: `git\s+push\s+(?:\S+\s+)?(?:develop|main|master)\b`
- **Layer**: Execution

## Enforcement

- **Action**: block
- **Severity**: critical
