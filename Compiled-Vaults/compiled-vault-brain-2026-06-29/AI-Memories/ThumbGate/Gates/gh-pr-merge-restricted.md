---
title: gh-pr-merge-restricted
type: gate
action: block
tool: any
pattern: gh\s+pr\s+merge
severity: high
layer: Identity
---

# Gate: gh-pr-merge-restricted

## Description

PR merging requires explicit 'pr_merge_allowed' satisfaction with evidence of user permission.

## Match Conditions

- **Pattern**: `gh\s+pr\s+merge`
- **Layer**: Identity
- **Unless**: `pr_merge_allowed`

## Enforcement

- **Action**: block
- **Severity**: high
