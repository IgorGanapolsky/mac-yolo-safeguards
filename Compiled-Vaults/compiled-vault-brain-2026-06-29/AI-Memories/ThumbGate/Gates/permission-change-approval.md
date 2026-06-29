---
title: permission-change-approval
type: gate
action: approve
tool: any
pattern: "(?:chmod|chown|setfacl|iam|policy|role|grant|revoke)\\s+"
severity: high
layer: Execution
---

# Gate: permission-change-approval

## Description

Permission or IAM change detected. Human approval required before this action can proceed.

## Match Conditions

- **Pattern**: `(?:chmod|chown|setfacl|iam|policy|role|grant|revoke)\s+`
- **Layer**: Execution

## Enforcement

- **Action**: approve
- **Severity**: high
