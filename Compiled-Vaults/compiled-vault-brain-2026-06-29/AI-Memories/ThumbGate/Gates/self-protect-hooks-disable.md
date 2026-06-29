---
title: self-protect-hooks-disable
type: gate
action: block
tool: any
pattern: "(?:settings\\.json|settings\\.local\\.json).*(?:hooks|PreToolUse|PostToolUse)"
severity: critical
layer: Execution
---

# Gate: self-protect-hooks-disable

## Description

Self-protection: agent cannot modify hook registrations.

## Match Conditions

- **Pattern**: `(?:settings\.json|settings\.local\.json).*(?:hooks|PreToolUse|PostToolUse)`
- **Layer**: Execution

## Enforcement

- **Action**: block
- **Severity**: critical
