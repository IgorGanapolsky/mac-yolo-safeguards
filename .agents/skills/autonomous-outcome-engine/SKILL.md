---
name: autonomous-outcome-engine
description: Autonomous Outcome Execution & Zero-Babysitting Engine. Drives full task lifecycles (scope audit, lock validation, TDD test loops, atomic shipping, and live verifiable proof) without mid-task pauses or handoffs.
---

# Autonomous Outcome Engine Skill

Enforces the **Full Outcome Ownership Protocol** across all coding agents on Igor's Mac. Eliminates conversational babysitting, premature turn-stopping, unverified claims, and partial handoffs.

## The 5-Stage Autonomous Outcome Loop

1. **Scope & Origin Audit**:
   - Resolve target files and exact system state.
   - Fetch and check `origin/main` before making assumptions.
2. **Multi-Agent Lock Protection**:
   - Check and claim files in `plan.md` §2 before modifying shared assets.
   - Never edit another active agent's locked file.
3. **TDD Test & Verification Loop**:
   - Implement minimal, robust changes.
   - Run unit and integration tests locally; zero broken test suites.
4. **Atomic Commit & Deployment**:
   - Stage only task-relevant files.
   - Pass pre-commit pattern gates (`PLAN_AGENT_ID=antigravity`).
   - Rebase cleanly on `origin/main`, push, and deploy to live production.
5. **Verifiable Proof Emission**:
   - Execute live probes (curl, API checks, test assertions).
   - Return turn with concrete evidence in the same response.

## CLI Usage

```bash
# Check readiness of the autonomous execution harness
bin/autonomous-outcome doctor

# Execute an autonomous outcome lifecycle
bin/autonomous-outcome run "Deploy Landing VPS Continuity Fix"
```

## Programmatic Usage

```javascript
const {
  AUTONOMOUS_PILLARS,
  auditAutonomyReadiness,
  runAutonomyLoop,
} = require('./tools/autonomous-outcome-engine');
```
