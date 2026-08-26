---
name: gitbutler-fleet-automations
description: >
  GitButler automations for Igor's multi-agent fleet: but skill install/check,
  but agent setup --print, forge/AI config, stacked PRs, absorb, session
  branches, isolated MCP. Overlay on gitbutler-fleet-safe. Complementary to
  Codex #2119 gitbutler-route (do not dual-edit it). Auto-invoke on GitButler
  automations, but agent, but skill, but mcp, but pr auto-merge, absorb,
  session branch. Slash: /gitbutler-fleet-automations.
---

# GitButler automations (fleet)

Official recipes (overwritten by `but skill check --update`): `~/.grok/skills/gitbutler`.
Collision wall: [[gitbutler-fleet-safe]] / Codex #2119 `tools/gitbutler-route.js`.
Cloud login: [[gitbutler-google-sso]] (Google SSO personal Gmail; never GitHub for Cloud).
Companions: [[gitbutler-mcp-isolated]], [[gitbutler-session-absorb]].

CLI measured: `but 0.22.1`. Doctor (live 2026-08-26): exit 0, 8 skill installs, REFUSE on ThumbGate/mac-yolo/RealEstate.

```bash
node tools/gitbutler-fleet-automations.js --demo --json
node tests/test-gitbutler-fleet-automations.js
bash ~/.grok/skills/gitbutler-fleet-automations/scripts/doctor.sh
```

Do **not** edit `tools/gitbutler-route.js` (Codex PR #2119). This skill is the doing layer.

## Layer order

1. `gitbutler-fleet-safe` / `gitbutler-route` — MAY I use `but` here? Exit 1 = `git` + isolated worktree.
2. This skill — HOW this fleet automates.
3. Official `but` skill — exact flags / CLI IDs.

## Automations we run

| Automation | Command | Fleet rule |
|---|---|---|
| Skill install (global) | `but skill install --global` / `--detect` | 8 agent formats at CLI version. Never put fleet rules in the official SKILL.md |
| Skill freshness | `but skill check` | `--update` overwrites official skill only |
| Agent steering | `but agent setup --print` | TTY wizard is `but agent setup`. Do not paste into sibling `AGENTS.md` |
| Session branch | `but commit -b agent/<slug> -m "…" <ids>` | Isolated GitButler clone only. Linked worktrees use `git` |
| Absorb | `but absorb <hunk-id>` | Unpublished own commit. Never another agent's branch |
| Undo | `but undo` / `but oplog` | Prefer over reflog |
| Stacked PRs | `but pr new <top-branch>` | Isolated clone. `gh pr create` breaks stack metadata |
| Auto-merge | `but pr auto-merge` | Same as `gh`: never around ThumbGate protection |
| Land | `but land` | **NEVER** on ThumbGate / mac-yolo `main` |
| MCP | `scripts/mcp_isolated.sh` | `but mcp serve` **after** `assert_but_setup_safe.sh` exit 0. **Do not** add `[mcp_servers.gitbutler]` to `~/.grok/config.toml` |
| Cursor hooks | `but cursor` | **Missing on CLI 0.22.1** (`unrecognized subcommand`). Do not write `~/.cursor/hooks.json` for it |
| Pre-push hooks | default on `but push` / `but pr new` | `--no-hooks` only for a proven false deny |

## Rubric

- `but --version` = **0.22.1**
- `but skill check` → 8 installs, all up to date
- `doctor.sh` exit 0 and REFUSE on ThumbGate / mac-yolo / RealEstate
- No global Grok GitButler MCP
- No Cursor hooks.json calling a missing `but cursor`
- Complementary to #2119, files not dual-edited

Igor's standing ship mandate overrides GitButler's "do not push unless asked" once the task already includes PR/push.

## Related

- [[gitbutler-fleet-safe]]
- [[gitbutler-mcp-isolated]]
- [[gitbutler-session-absorb]]
- [[gitbutler-google-sso]]
- Official: `~/.grok/skills/gitbutler/SKILL.md`
