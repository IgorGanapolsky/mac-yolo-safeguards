---
title: push-without-thread-check
type: gate
action: block
tool: "Bash:git_push"
pattern: git\s+push
severity: critical
layer: Decisions
---

# Gate: push-without-thread-check

## Description

Check PR review threads (reviewThreads first:50) before pushing. Use satisfy_gate('pr_threads_checked', 'evidence') to bypass.

## Match Conditions

- **Pattern**: `git\s+push`
- **Layer**: Decisions
- **Unless**: `pr_threads_checked`

## Enforcement

- **Action**: block
- **Severity**: critical
