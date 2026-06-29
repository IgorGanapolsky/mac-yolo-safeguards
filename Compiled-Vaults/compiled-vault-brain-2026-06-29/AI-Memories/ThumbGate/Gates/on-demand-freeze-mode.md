---
title: on-demand-freeze-mode
type: gate
action: block
tool: any
pattern: .*
severity: high
layer: Decisions
---

# Gate: on-demand-freeze-mode

## Description

Freeze mode is active. Edits outside the frozen directory are blocked.

## Match Conditions

- **Pattern**: `.*`
- **Layer**: Decisions

## Enforcement

- **Action**: block
- **Severity**: high
