---
title: non-critical-warning-log
type: gate
action: log
tool: any
pattern: "(?:console\\.log|debugger|TODO|FIXME|HACK|XXX)"
severity: low
layer: Decisions
---

# Gate: non-critical-warning-log

## Description

Non-critical code pattern detected. Action recorded for audit trail but allowed to proceed.

## Match Conditions

- **Pattern**: `(?:console\.log|debugger|TODO|FIXME|HACK|XXX)`
- **Layer**: Decisions

## Enforcement

- **Action**: log
- **Severity**: low
