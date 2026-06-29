---
title: gh-pr-create-restricted
type: gate
action: block
tool: any
pattern: gh\s+pr\s+create
severity: high
layer: Identity
---

# Gate: gh-pr-create-restricted

## Description

PR creation requires explicit 'pr_create_allowed' satisfaction with evidence of user permission.

## Match Conditions

- **Pattern**: `gh\s+pr\s+create`
- **Layer**: Identity
- **Unless**: `pr_create_allowed`

## Enforcement

- **Action**: block
- **Severity**: high
