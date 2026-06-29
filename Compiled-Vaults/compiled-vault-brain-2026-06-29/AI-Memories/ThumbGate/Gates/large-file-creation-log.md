---
title: large-file-creation-log
type: gate
action: log
tool: any
pattern: .*
severity: low
layer: Execution
---

# Gate: large-file-creation-log

## Description

Large file write detected. Action recorded for audit trail but allowed to proceed.

## Match Conditions

- **Pattern**: `.*`
- **Layer**: Execution

## Enforcement

- **Action**: log
- **Severity**: low
