---
title: self-protect-kill
type: gate
action: block
tool: any
pattern: "(?:kill|pkill|killall)\\s+.*(?:thumbgate|gates-engine|budget-enforcer)"
severity: critical
layer: Execution
---

# Gate: self-protect-kill

## Description

Self-protection: agent cannot terminate ThumbGate processes.

## Match Conditions

- **Pattern**: `(?:kill|pkill|killall)\s+.*(?:thumbgate|gates-engine|budget-enforcer)`
- **Layer**: Execution

## Enforcement

- **Action**: block
- **Severity**: critical
