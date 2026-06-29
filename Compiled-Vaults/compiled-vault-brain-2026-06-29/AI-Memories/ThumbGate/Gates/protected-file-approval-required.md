---
title: protected-file-approval-required
type: gate
action: block
tool: any
pattern: .*
severity: critical
layer: Decisions
---

# Gate: protected-file-approval-required

## Description

Protected files require explicit approval before editing or publishing.

## Match Conditions

- **Pattern**: `.*`
- **Layer**: Decisions

## Enforcement

- **Action**: block
- **Severity**: critical
