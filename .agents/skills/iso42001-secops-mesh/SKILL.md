---
name: iso42001-secops-mesh
description: >
  Threat Intelligence–Driven SecOps & ISO/IEC 42001 AI Risk Governance mesh.
  Pre-action threat signature scanning, least-privilege role entitlement scoping,
  and SHA-256 signed audit receipts. Trigger: iso42001, AI compliance, threat intel,
  secops guard, agent entitlement, sailpoint, role boundaries.
---

# Threat-Intel SecOps & ISO 42001 AI Governance Mesh

## Capabilities

1. **Threat Intelligence Signature Guard** (`tools/threat-intel-secops-guard.js`):
   - Pre-action screening for reverse shells, cloud metadata SSRF (`169.254.169.254`), credential dumping, and exfiltration webhooks.
   - Fail-closed execution denial on threat match.

2. **ISO/IEC 42001 Compliance Audit Receipts** (`generateISO42001Receipt`):
   - Generates tamper-evident SHA-256 cryptographic receipts for Control A.6 (Risk Assessment) and Control A.9 (Model Verification).

3. **SailPoint-Style Least-Privilege Entitlements** (`tools/agent-identity-entitlement.js`):
   - Restricts subagent roles (`researcher`, `test_engineer`, `ship_engineer`, `secops_auditor`) to explicit capability tokens (`fs:read`, `fs:write:tests`, `git:commit`, `pr:open`, `finance:spend`).

## Verification Commands

```bash
# Run full SecOps & ISO 42001 test suite
node tests/test-threat-intel-secops-guard.js
```
