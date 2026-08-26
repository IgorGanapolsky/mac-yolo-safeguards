---
name: gitbutler-mcp-isolated
description: >
  GitButler MCP (`but mcp serve`) only on an isolated clone that already
  passed assert_but_setup_safe.sh. Never add it to global ~/.grok/config.toml
  (mac-yolo/ThumbGate cwd would expose but tools on a shared tree). Trigger:
  GitButler MCP, but mcp, gitbutler mcp.json. Slash: /gitbutler-mcp-isolated.
---

# GitButler MCP — isolated clone only

`but mcp serve` exposes workspace/review tools. That is GitButler **workspace**
mode. Shared primaries (ThumbGate, mac-yolo 83 worktrees, RealEstate) stay on
`gh` + GitHub MCP.

```bash
bash ~/.grok/skills/gitbutler-fleet-safe/scripts/assert_but_setup_safe.sh "$PWD"
# exit 0 only on a single-owner clone with one worktree
.agents/skills/gitbutler-fleet-automations/scripts/mcp_isolated.sh
```

## MUST

- Enable MCP in **that clone's** `.grok/config.toml` / `.cursor/mcp.json`:
  `command = "…/mcp_isolated.sh"` (wrapper asserts safety then `but mcp serve`).
- Workspace tools prefer filesystem roots the MCP client supplies.

## NEVER

- `[mcp_servers.gitbutler]` in `~/.grok/config.toml` (global Grok cwd is shared repos)
- `claude mcp add gitbutler but mcp` against ThumbGate / mac-yolo / RealEstate primary
- Treat MCP as a substitute for `npm run pr:manage` / Trunk
- Dual-edit Codex `tools/gitbutler-route.js`

## Related

- [[gitbutler-fleet-automations]]
- [[gitbutler-fleet-safe]]
