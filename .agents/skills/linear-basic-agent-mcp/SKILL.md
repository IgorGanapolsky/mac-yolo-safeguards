---
name: linear-basic-agent-mcp
description: >
  Use Linear Agent chat, team/personal Agent skills, and Linear MCP on Basic.
  Coding sessions need AI credits (fail closed at $0). Loops stay Business.
  Complementary to Codex linear-agent-skill-exporter — do not dual-edit it.
  Slash: /linear-basic-agent-mcp.
---

# Linear Basic — Agent + MCP + native skills

Included on Basic (no extra seat): Linear Agent chat (`⌘J` / `@Linear`),
personal + team-shared Agent skills, MCP at `https://mcp.linear.app/mcp`,
agent platform (Cursor/GitHub agents). **Loops = Business. Code Intelligence =
Business.** Coding sessions = Basic **plus** AI credits.

```bash
node tools/linear-basic-full-use.js --export-agent-skills --json
~/.grok/skills/linear-basic-full-use/scripts/linear_mcp.sh
```

Grok MCP: `[mcp_servers.linear]` command = `linear_mcp.sh` (PAT from
`~/.config/linear/api_key`, never from chat or toml).

## MUST

- Paste the six native skills from `--export-agent-skills` into
  Linear → Agent → Skills (personal or AGENT team-shared). There is no
  GraphQL `skillCreate` on this PAT — UI paste is the rail.
- GraphQL PAT remains the **lock** source of truth. MCP is for interactive
  search/create, not for stealing `agent-codex` locks.
- Linear Agent user stays `active=true`. Cursor OAuth stays (even if
  `active=false`). Devin stays suspended — API cannot revoke app users.

## NEVER

- Dual-edit `tools/linear-agent-skill-exporter.js` (Codex PR #2121)
- Auto-top-up AI credits (min $10; auto-reload min $50)
- Claim a coding session succeeded when remaining credits are $0
- Enable Loops / Code Intelligence / Triage Intelligence

## Related

- [[linear-basic-full-use]]
- [[linear-no-steal-locks]]
