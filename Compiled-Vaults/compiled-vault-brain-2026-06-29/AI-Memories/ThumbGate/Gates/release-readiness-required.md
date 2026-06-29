---
title: release-readiness-required
type: gate
action: block
tool: any
pattern: "^(gh\\s+release\\s+create|git\\s+tag\\b|npm\\s+publish|yarn\\s+publish|pnpm\\s+publish)"
severity: critical
layer: Execution
---

# Gate: release-readiness-required

## Description

Release and publish actions require a releasable mainline commit and a matching version plan.

## Match Conditions

- **Pattern**: `^(gh\s+release\s+create|git\s+tag\b|npm\s+publish|yarn\s+publish|pnpm\s+publish)`
- **Layer**: Execution

## Enforcement

- **Action**: block
- **Severity**: critical
