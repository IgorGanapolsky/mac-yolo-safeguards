---
name: thumbgate-wake-governance
description: ThumbGate Always-On Wake Watchdog, Pre-Action Checkpoints & Project Architecture Wiki Generator (Stolen from Qoder & QoderWake).
---

# ThumbGate Wake Governance Skill

Brings Qoder & QoderWake's highest-ROI capabilities directly to ThumbGate:
1. **Always-On Wake Daemon**: Monitors multi-agent processes across worktrees, preventing runaway token burns, hung jobs, or broken locks.
2. **Pre-Action Checkpoints & 1-Click Rollback**: Automatically snapshots active file states before high-risk mutations so regressions can be undone instantly.
3. **Automated Architecture Wiki**: Auto-compiles live codebase relationship summaries into ThumbGate context packs.

## Global System Commands

- **`bin/thumbgate-wake --doctor`**: Health check for the ThumbGate Wake daemon and checkpoint store.
- **`bin/thumbgate-wake --snapshot "<name>"`**: Creates an atomic pre-action checkpoint.
- **`bin/thumbgate-wake --wiki`**: Generates and prints the updated codebase architecture wiki.

## Verification

```bash
# Doctor Status Check
bin/thumbgate-wake --doctor

# Run Automated Test Suite
node tests/test-thumbgate-wake-governance.js

# Generate Architecture Wiki
bin/thumbgate-wake --wiki
```
