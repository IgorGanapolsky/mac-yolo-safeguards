---
title: loop-abuse-prevention
type: gate
action: block
tool: any
pattern: "loop\\s+\\d+\\s+.*(curl|wget|rm\\s+-rf|git\\s+push|gh\\s+pr)"
severity: critical
layer: Decisions
---

# Gate: loop-abuse-prevention

## Description

High-risk command detected inside a loop. Scheduled tasks must not perform egress or destructive writes without explicit approval.

## Match Conditions

- **Pattern**: `loop\s+\d+\s+.*(curl|wget|rm\s+-rf|git\s+push|gh\s+pr)`
- **Layer**: Decisions

## Enforcement

- **Action**: block
- **Severity**: critical
