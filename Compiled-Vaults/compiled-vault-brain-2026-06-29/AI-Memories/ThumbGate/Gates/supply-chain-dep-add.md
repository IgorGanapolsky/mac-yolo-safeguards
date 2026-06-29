---
title: supply-chain-dep-add
type: gate
action: warn
tool: any
pattern: package\.json$
severity: high
layer: Supply Chain
---

# Gate: supply-chain-dep-add

## Description

Dependency mutation detected in package.json. Security scanner will audit for typosquatting, wildcard versions, and suspicious install scripts.

## Match Conditions

- **Pattern**: `package\.json$`
- **Layer**: Supply Chain

## Enforcement

- **Action**: warn
- **Severity**: high
