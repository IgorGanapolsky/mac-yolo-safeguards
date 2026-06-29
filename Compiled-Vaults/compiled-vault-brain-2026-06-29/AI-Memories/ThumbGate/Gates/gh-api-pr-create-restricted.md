---
title: gh-api-pr-create-restricted
type: gate
action: block
tool: any
pattern: "gh\\s+api\\b(?=.*(?:/pulls\\b|repos/[^\\s]+/[^\\s]+/pulls\\b))(?=.*(?:-f\\b|--field\\b|-F\\b|--raw-field\\b|--method\\s+POST\\b|-X\\s+POST\\b))"
severity: high
layer: Identity
---

# Gate: gh-api-pr-create-restricted

## Description

GitHub API PR creation requires explicit 'pr_create_allowed' satisfaction with evidence of user permission. Use the same approval path as gh pr create.

## Match Conditions

- **Pattern**: `gh\s+api\b(?=.*(?:/pulls\b|repos/[^\s]+/[^\s]+/pulls\b))(?=.*(?:-f\b|--field\b|-F\b|--raw-field\b|--method\s+POST\b|-X\s+POST\b))`
- **Layer**: Identity
- **Unless**: `pr_create_allowed`

## Enforcement

- **Action**: block
- **Severity**: high
