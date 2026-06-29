---
title: force-push
type: gate
action: block
tool: "Bash:git_force_push"
pattern: "git\\s+push\\s+(--force|-f)"
severity: critical
layer: Execution
---

# Gate: force-push

## Description

Force push blocked. This is destructive and irreversible.

## Match Conditions

- **Pattern**: `git\s+push\s+(--force|-f)`
- **Layer**: Execution

## Enforcement

- **Action**: block
- **Severity**: critical
