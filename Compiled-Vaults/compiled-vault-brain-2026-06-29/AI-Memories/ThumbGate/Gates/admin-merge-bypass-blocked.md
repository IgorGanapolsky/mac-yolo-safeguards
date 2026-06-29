---
title: admin-merge-bypass-blocked
type: gate
action: block
tool: any
pattern: gh\s+pr\s+merge.*--admin
severity: critical
layer: Execution
---

# Gate: admin-merge-bypass-blocked

## Description

Admin merge bypass is blocked. Use the merge queue or normal protected-branch flow.

## Match Conditions

- **Pattern**: `gh\s+pr\s+merge.*--admin`
- **Layer**: Execution

## Enforcement

- **Action**: block
- **Severity**: critical
