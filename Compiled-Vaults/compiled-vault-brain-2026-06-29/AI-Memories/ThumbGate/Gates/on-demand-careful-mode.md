---
title: on-demand-careful-mode
type: gate
action: block
tool: any
pattern: "(rm\\s+-rf|drop\\s+table|force-push|git\\s+push\\s+-[fF]|git\\s+push\\s+--force|kubectl\\s+delete)"
severity: critical
layer: Execution
---

# Gate: on-demand-careful-mode

## Description

Careful mode is active. Dangerous command is blocked.

## Match Conditions

- **Pattern**: `(rm\s+-rf|drop\s+table|force-push|git\s+push\s+-[fF]|git\s+push\s+--force|kubectl\s+delete)`
- **Layer**: Execution

## Enforcement

- **Action**: block
- **Severity**: critical
