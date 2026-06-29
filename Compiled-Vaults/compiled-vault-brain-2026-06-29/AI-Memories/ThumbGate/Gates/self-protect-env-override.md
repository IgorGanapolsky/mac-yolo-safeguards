---
title: self-protect-env-override
type: gate
action: block
tool: any
pattern: "(?:export|unset)\\s+(?:THUMBGATE_|LANEKEEP_)"
severity: critical
layer: Execution
---

# Gate: self-protect-env-override

## Description

Self-protection: agent cannot modify ThumbGate environment variables.

## Match Conditions

- **Pattern**: `(?:export|unset)\s+(?:THUMBGATE_|LANEKEEP_)`
- **Layer**: Execution

## Enforcement

- **Action**: block
- **Severity**: critical
