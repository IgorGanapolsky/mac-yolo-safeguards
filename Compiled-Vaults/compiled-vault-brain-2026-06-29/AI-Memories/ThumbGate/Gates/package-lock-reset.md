---
title: package-lock-reset
type: gate
action: block
tool: "Bash:package_lock"
pattern: git\s+checkout\s+\S+\s+--\s+package-lock\.json
severity: critical
layer: Execution
---

# Gate: package-lock-reset

## Description

Never reset package-lock.json from another branch. Run npm install instead.

## Match Conditions

- **Pattern**: `git\s+checkout\s+\S+\s+--\s+package-lock\.json`
- **Layer**: Execution

## Enforcement

- **Action**: block
- **Severity**: critical
