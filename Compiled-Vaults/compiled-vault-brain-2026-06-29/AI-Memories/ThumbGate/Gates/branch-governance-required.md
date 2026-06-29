---
title: branch-governance-required
type: gate
action: block
tool: any
pattern: "^(gh\\s+pr\\s+(create|merge)|gh\\s+api\\b(?=.*(?:/pulls\\b|repos/[^\\s]+/[^\\s]+/pulls\\b))(?=.*(?:-f\\b|--field\\b|-F\\b|--raw-field\\b|--method\\s+POST\\b|-X\\s+POST\\b))|gh\\s+release\\s+create|git\\s+tag\\b|npm\\s+publish|yarn\\s+publish|pnpm\\s+publish)"
severity: critical
layer: Decisions
---

# Gate: branch-governance-required

## Description

PR, release, and publish actions require explicit branch governance.

## Match Conditions

- **Pattern**: `^(gh\s+pr\s+(create|merge)|gh\s+api\b(?=.*(?:/pulls\b|repos/[^\s]+/[^\s]+/pulls\b))(?=.*(?:-f\b|--field\b|-F\b|--raw-field\b|--method\s+POST\b|-X\s+POST\b))|gh\s+release\s+create|git\s+tag\b|npm\s+publish|yarn\s+publish|pnpm\s+publish)`
- **Layer**: Decisions

## Enforcement

- **Action**: block
- **Severity**: critical
