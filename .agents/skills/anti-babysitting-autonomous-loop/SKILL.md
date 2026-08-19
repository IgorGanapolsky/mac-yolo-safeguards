---
name: anti-babysitting-autonomous-loop
description: >
  Autonomous Anti-Babysitting & Continuous Self-Driving Engine. Automatically scans for open PRs, invariant drift, and pending tasks, driving them to green verification and shipping without manual human handoffs.
  trigger: ["anti-babysitting", "self-driving", "zero-handoffs", "gsd", "autonomous"]
---

# Anti Babysitting Autonomous Loop

## Overview

Autonomous Anti-Babysitting & Continuous Self-Driving Engine. Automatically scans for open PRs, invariant drift, and pending tasks, driving them to green verification and shipping without manual human handoffs.

## Autonomous Execution Playbook

1. Scan open tasks in plan.md.
2. Claim file before editing in plan.md.
3. Execute code changes.
4. Run tests and verify.
5. Commit, push, and open PR with auto-merge.

## Verification Commands

```bash
node tests/test-anti-babysitting-engine.js
```
