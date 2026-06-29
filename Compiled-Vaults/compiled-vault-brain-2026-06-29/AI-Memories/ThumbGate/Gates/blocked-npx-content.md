---
title: blocked-npx-content
type: gate
action: block
tool: "Bash:exec"
pattern: .*
severity: critical
layer: Supply Chain
---

# Gate: blocked-npx-content

## Description

Blocked npx execution by content hash. Renaming the binary does not bypass this gate.

## Match Conditions

- **Pattern**: `.*`
- **Layer**: Supply Chain

## Enforcement

- **Action**: block
- **Severity**: critical
