---
title: rm-rf-home-or-root
type: gate
action: block
tool: "Bash:rm_rf_home_or_root"
pattern: "(?:^|[;&|]\\s*)rm\\s+-(?=[^\\s]*r)(?=[^\\s]*f)[^\\s]+\\s+(?:/|/\\*|~(?:/[^\\s]*)?|\\$HOME(?:/[^\\s]*)?)(?:\\s|$)"
severity: critical
layer: Execution
---

# Gate: rm-rf-home-or-root

## Description

Broad rm -rf against root or home is blocked. Use a narrow, reviewed path and explicit approval for destructive deletes.

## Match Conditions

- **Pattern**: `(?:^|[;&|]\s*)rm\s+-(?=[^\s]*r)(?=[^\s]*f)[^\s]+\s+(?:/|/\*|~(?:/[^\s]*)?|\$HOME(?:/[^\s]*)?)(?:\s|$)`
- **Layer**: Execution

## Enforcement

- **Action**: block
- **Severity**: critical
