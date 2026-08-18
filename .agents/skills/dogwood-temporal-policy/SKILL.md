---
name: dogwood-temporal-policy
description: AWS Dogwood Temporal Agent Policy & Sequence Governance Engine (MFOTL temporal logic, formerly/count_within/sum_within operators, concurrency-safe in-flight spend caps, taint data exfiltration firewall) for all coding agents on Igor's Mac.
---

# AWS Dogwood Temporal Sequence Agent Policy Skill

This skill implements AWS Dogwood's temporal agent policy specification (extending Cedar) to govern sequences of agent tool calls across time.

## Global System Commands

- **`bin/dogwood-policy`** (or **`bin/dogwood`**): Runs complete temporal diagnostics suite.
- **`bin/dogwood --rules`**: Lists all active temporal sequence policies.
- **`bin/dogwood --json`**: Emits JSON telemetry for CI/CD and multi-agent health checks.

## Key Capabilities

1. **Temporal Logic (MFOTL Operators)**:
   - `formerly(action, windowMs)`: Enforces prerequisite human approval (`approval::satisfy_gate`) before destructive mutations (`git::force_push`, `fs::delete_file`, `db::drop_table`).
   - `count_within(action, windowMs)`: Enforces burst rate-limiting across tool invocations.
   - `sum_within(field, action, windowMs)`: Concurrency-safe sliding-window financial/token spend caps.

2. **Data Taint & Exfiltration Firewall**:
   - Automatically forbids external network egress (`http::curl_external`, email, webhooks) once secrets or confidential files have been read in the session trace.

## Verification

```bash
# Doctor Status Check
bin/dogwood --doctor

# Run Automated Test Suite
node tests/test-dogwood-temporal-policy.js

# Evaluate Action JSON
bin/dogwood --eval '{"action":"git::force_push","target":"origin/main"}'
```
