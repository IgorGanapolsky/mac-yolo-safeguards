---
title: task-scope-edit-boundary
type: gate
action: block
tool: any
pattern: .*
severity: critical
layer: Decisions
---

# Gate: task-scope-edit-boundary

## Description

Edits outside the declared task scope are blocked once a task scope is active.

## Match Conditions

- **Pattern**: `.*`
- **Layer**: Decisions

## Enforcement

- **Action**: block
- **Severity**: critical
