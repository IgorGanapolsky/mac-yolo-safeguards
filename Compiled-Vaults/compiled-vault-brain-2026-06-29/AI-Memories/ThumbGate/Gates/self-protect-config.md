---
title: self-protect-config
type: gate
action: block
tool: any
pattern: "(?:config/gates/|config/budget\\.json|\\.thumbgate/|thumbgate\\.json)"
severity: critical
layer: Execution
---

# Gate: self-protect-config

## Description

Self-protection: agent cannot modify ThumbGate configuration, gate rules, or budget settings.

## Match Conditions

- **Pattern**: `(?:config/gates/|config/budget\.json|\.thumbgate/|thumbgate\.json)`
- **Layer**: Execution

## Enforcement

- **Action**: block
- **Severity**: critical
