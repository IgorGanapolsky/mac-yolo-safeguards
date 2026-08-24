---
name: mcp-persona-entitlements
description: >
  TrueFoundry MCP/Agent Gateway process steal: curated MCP catalog, persona
  RBAC (junior=read-only vs operator write), step-level workflow cost.
  Not an OAuth gateway and not a TrueFoundry clone. Slash: /mcp-persona-entitlements.
---

# MCP persona entitlements (mechanics, not products)

Source: TrueFoundry email 2026-08-24 “MCP and agents — beyond LLM routing”
(https://truefoundry.com/docs/ai-gateway/mcp/mcp-overview).

```bash
node tools/mcp-persona-entitlements.js catalog --json
node tools/mcp-persona-entitlements.js evaluate --persona junior --server github --action write
node tools/mcp-persona-entitlements.js workflow --json --persona operator --steps '[{"server":"grepai","action":"read","costUsd":0}]'
node tests/test-mcp-persona-entitlements.js
```

| NEVER | ALWAYS |
|-------|--------|
| Clone TrueFoundry MCP Gateway / Agent Gateway | Local catalog + evaluate + step cost |
| Okta / Azure AD / unified OAuth proxy | Fail-closed unknown server |
| Dual-edit Codex `agent-action-trace.js` | Return an audit object; do not append their JSONL |
| Net-new agent-governance SKU (ECI) | Fleet doctor for this repo's `.mcp.json` |
| Hero Continuity / Mac-pair | Hosted VPS product lock |

Personas: `guest`/`junior` (read-only, no paid APIs) · `operator` (contained-write) · `admin` (critical, e.g. gmail send).
