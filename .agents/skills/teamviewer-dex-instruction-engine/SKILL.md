---
name: teamviewer-dex-instruction-engine
description: TeamViewer DEX (Digital Employee Experience) Instruction Runner, Dynamic Parameter Validator, Bounded Remote Target Guard & AI Session Summary Distiller stolen from TeamViewer.
trigger: ["teamviewer", "dex", "instruction-runner", "remote-support", "augmented-summary", "parameter-validator"]
---

# TeamViewer DEX Instruction Engine & Remote Support Architecture

Steals the top high-ROI patterns from TeamViewer's open-source repositories (`teamviewer/DexInstructionRunner`, `teamviewer/teamviewer-mcp-server`, `teamviewer/TV_Remote_MCP`, `teamviewer/TeamViewerPS`):

1. **Dynamic Parameter Editor & Type Discovery**:
   - Converts remote execution instructions into typed, validated parameters (`boolean`, `number`, `enum`, `string`, regex patterns, defaults) before dispatch.
2. **Safe Bounded Endpoint Targeting**:
   - Limits remote execution batches to $\le 10$ devices with explicit FQDN matching, rejecting wildcard / blast-radius sprawl.
3. **Augmented AI Session Summaries**:
   - Distills multi-turn agent transcripts into verifiable executive support receipts.
4. **Least-Privilege RBAC Matrix**:
   - Restricts sensitive actions (`device_support`, `admin_policy`) from standard read-only tool callers.

## CLI Usage

```bash
# Run CLI test / sample dispatch
node tools/teamviewer-dex-instruction-engine.js

# Run test suite
node tests/test-teamviewer-dex-instruction-engine.js
```
