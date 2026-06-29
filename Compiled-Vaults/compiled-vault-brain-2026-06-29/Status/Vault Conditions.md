---
type: "status-conditions"
source_status: "generated"
last_verified: "2026-06-29T05:23:41.303Z"
---
# Vault Conditions

This file uses a Kubernetes-style status pattern: each condition reports an
observed state, reason, message, and observed generation. LLMs should treat
status=False as a stop gate unless the task is explicitly to repair that
condition.

| Type | Status | Reason | Message | Observed Generation |
|------|--------|--------|---------|---------------------|
| SourceInventoryReady | True | MinimumSourcesFound | 9/9 source candidates exist. | 1 |
| AgentSyncReadable | True | SyncBriefGenerated | Sync brief branch=main dirty=23. | 1 |
| ValidationPassed | True | RequiredArtifactsPresent | 24 files checked; missing=0; secretFindings=[REDACTED] | 1 |

## Provenance

- SOURCE-MANIFEST.md
- state.json
