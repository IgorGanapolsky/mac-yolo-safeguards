---
name: nex-playbook-engine
description: Nex.ai / WUPHF-Style Autonomous Playbook Engine & Team Knowledge Graph. Converts ad-hoc agent prompts into deterministic multi-step playbooks executed by specialized digital workers (Chief, Revenue Ralph, Ship Engineer, QA Auditor).
---

# Nex Playbook Engine Skill

Implements the Playbook & Virtual Teammate architecture from Nex.ai (WUPHF by Nex.ai):
1. **Deterministic Business Playbooks**: Replaces ad-hoc vibe prompts with multi-stage execution playbooks (`b2b_revenue_dispatch`, `pr_hygiene_and_ship`, `outage_resilience_triage`).
2. **Virtual Teammates**:
   - `Chief`: Fleet coordinator and priority triage.
   - `Revenue Ralph`: Fast-cash B2B outreach & Stripe billing.
   - `Ship Engineer`: Automated git hygiene, CI/CD auto-merge, and deployment.
   - `QA Auditor`: E2E test verification and canary health auditing.
3. **Git-Backed Knowledge Sync**: Automatically captures execution duration, step outcomes, and verifiable audit receipts.

## Global System Commands

- **`bin/nex-engine --doctor`**: Health diagnostics and registered playbooks.
- **`bin/nex-engine --list-playbooks`**: Lists all available fleet playbooks.
- **`bin/nex-engine --run <playbook_id>`**: Runs a specific playbook end-to-end.
- **`bin/nex-engine --json`**: Emits structured execution telemetry.

## Verification

```bash
# Doctor Status Check
bin/nex-engine --doctor

# Run Automated Test Suite
node tests/test-nex-playbook-engine.js

# Execute B2B Revenue Playbook
bin/nex-engine --run b2b_revenue_dispatch
```
