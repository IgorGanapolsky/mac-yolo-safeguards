---
title: task-scope-required
type: gate
action: block
tool: any
pattern: "^(git\\s+(add|commit|push)|gh\\s+pr\\s+(create|merge)|gh\\s+api\\b(?=.*(?:/pulls\\b|repos/[^\\s]+/[^\\s]+/pulls\\b))(?=.*(?:-f\\b|--field\\b|-F\\b|--raw-field\\b|--method\\s+POST\\b|-X\\s+POST\\b))|gh\\s+release\\s+create|git\\s+tag\\b|npm\\s+publish|yarn\\s+publish|pnpm\\s+publish)"
severity: critical
layer: Decisions
---

# Gate: task-scope-required

## Description

Git write, PR, release, and publish operations require an explicit task scope.

## Match Conditions

- **Pattern**: `^(git\s+(add|commit|push)|gh\s+pr\s+(create|merge)|gh\s+api\b(?=.*(?:/pulls\b|repos/[^\s]+/[^\s]+/pulls\b))(?=.*(?:-f\b|--field\b|-F\b|--raw-field\b|--method\s+POST\b|-X\s+POST\b))|gh\s+release\s+create|git\s+tag\b|npm\s+publish|yarn\s+publish|pnpm\s+publish)`
- **Layer**: Decisions

## Enforcement

- **Action**: block
- **Severity**: critical
