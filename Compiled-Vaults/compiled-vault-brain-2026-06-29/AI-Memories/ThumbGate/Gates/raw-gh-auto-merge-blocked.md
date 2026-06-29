---
title: raw-gh-auto-merge-blocked
type: gate
action: block
tool: any
pattern: "gh\\s+pr\\s+merge\\b[^\\n]*--auto"
severity: critical
layer: Execution
---

# Gate: raw-gh-auto-merge-blocked

## Description

Raw GitHub auto-merge is blocked. Use npm run pr:manage after all critical quality checks have terminal success.

## Match Conditions

- **Pattern**: `gh\s+pr\s+merge\b[^\n]*--auto`
- **Layer**: Execution

## Enforcement

- **Action**: block
- **Severity**: critical
