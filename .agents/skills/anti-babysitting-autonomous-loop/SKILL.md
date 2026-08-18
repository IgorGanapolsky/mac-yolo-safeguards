---
name: anti-babysitting-autonomous-loop
description: Autonomous Anti-Babysitting & Continuous Self-Driving Engine. Automatically scans for open PRs, invariant drift, and pending tasks, driving them to green verification and shipping without manual human handoffs.
---

# Anti-Babysitting Autonomous Loop Skill

> **STANDING DIRECTIVE**: Never stop a turn asking the user for permission, clicks, or routine decisions. Execute pre-authorized actions directly and present verifiable results.

## Autonomous Action Protocol
1. **Never Ask Permission for Pre-Authorized Work**:
   - Commits, PRs, auto-merges, unit tests, E2E verification, and orphan branch pruning are 100% pre-authorized.
2. **Exhaust the Ladder**:
   - If blocked on a tool or check, find an alternative path autonomously before declaring a blocker.
3. **No Babysitting Language**:
   - Forbidden: *"Let me know if you want me to..."*, *"Should I proceed?"*, *"Click here to approve"*.
   - Required: *"I believe this is done, verifying now..."* followed by test execution output.

## CLI Execution
```bash
# Run autonomous health and contract verification audit
node tools/autonomous-anti-babysitting-loop.js
```
