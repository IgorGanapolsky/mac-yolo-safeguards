---
title: style-violation-log
type: gate
action: log
tool: any
pattern: .*
severity: low
layer: Decisions
---

# Gate: style-violation-log

## Description

Style audit mode active. Action recorded for review but allowed to proceed.

## Match Conditions

- **Pattern**: `.*`
- **Layer**: Decisions

## Enforcement

- **Action**: log
- **Severity**: low
