---
name: fleet-repo-intelligence
description: Use shared local semantic code index (grepai + hermes-context) as JetBrains Context equivalent for all coding agents on Igor's Mac
---

# Fleet repo intelligence

## When
- Unfamiliar code, architecture questions, "where is X", cross-file causality
- Before large grep/find fan-out on mac-yolo-safeguards

## How
1. `node tools/fleet-repo-intelligence-status.js` — confirm index healthy
2. MCP tools from `.mcp.json` `grepai` server (`grepai_search`, trace tools)
3. CLI: `cd ~/.hermes/semantic-index/mac-yolo-safeguards && grepai search "query"`
4. Multi-repo: `hermes-context search "query"`
5. Optional graph: `.graphify-venv/bin/graphify query "query"`

## Never
- `grepai watch` from a live multi-worktree checkout
- Claim JetBrains Context / jbcontext is installed unless `which jbcontext` succeeds

## Install / heal
`bash tools/install-fleet-repo-intelligence.sh`

Docs: `docs/RESEARCH-JETBRAINS-CONTEXT-FLEET-202607.md`, `docs/LOCAL-SEMANTIC-CODE-INDEX.md`
