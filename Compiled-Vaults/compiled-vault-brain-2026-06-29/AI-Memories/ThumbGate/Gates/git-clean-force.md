---
title: git-clean-force
type: gate
action: block
tool: "Bash:git_clean_force"
pattern: "(?:^|[;&|]\\s*)git\\s+clean\\s+(?:-[^\\s]*f[^\\s]*|--force)\\b"
severity: critical
layer: Execution
---

# Gate: git-clean-force

## Description

git clean --force is blocked because it can delete untracked user work. Inventory files and get explicit approval before destructive cleanup.

## Match Conditions

- **Pattern**: `(?:^|[;&|]\s*)git\s+clean\s+(?:-[^\s]*f[^\s]*|--force)\b`
- **Layer**: Execution

## Enforcement

- **Action**: block
- **Severity**: critical
