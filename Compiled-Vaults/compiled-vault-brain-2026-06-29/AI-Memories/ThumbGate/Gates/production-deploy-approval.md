---
title: production-deploy-approval
type: gate
action: approve
tool: any
pattern: "(?:railway|fly|heroku|vercel|render|kubectl|helm)\\s+(?:deploy|up|apply|release|push|rollout)"
severity: high
layer: Execution
---

# Gate: production-deploy-approval

## Description

Production deploy detected. Human approval required before this action can proceed.

## Match Conditions

- **Pattern**: `(?:railway|fly|heroku|vercel|render|kubectl|helm)\s+(?:deploy|up|apply|release|push|rollout)`
- **Layer**: Execution

## Enforcement

- **Action**: approve
- **Severity**: high
