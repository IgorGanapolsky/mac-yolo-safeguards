# Multi-Agent Coordination: Linear + AI-Agent-Sync Vault

**Updated:** 2026-08-02  

## Does Linear / Obsidian Linear improve the harness?

| Piece | Improves multi-agent coordination? | Role |
|-------|-------------------------------------|------|
| **Linear workspace** (`linear.app/igorganapolsky/agent`) | **Yes — as task bus** when agents claim/release via API | Who owns which **issue** |
| **`linear-agent-bridge.js`** | **Yes — required path** for agents (claim/list/done + vault note) | Machine-readable locks |
| **Community [Obsidian Linear plugin](https://community.obsidian.md/plugins/linear)** | **No for locks** | Human **display** only (embed/filter issues in notes) |
| **plan.md file ownership** | Still required in-repo for megafile claims | Local agent swarm board |
| **AI-Agent-Sync vault** | **Yes — file/WIP bus** | Mid-flight files outside git |

**Verdict:** Linear improves intelligent coordination **only if** every agent uses the bridge (`--list` → `--claim` → work → `--done`). The Obsidian plugin alone does not coordinate agents; install it for your dashboard, not as SSOT.

**Bug fixed 2026-08-02:** Linear GraphQL `teams` without `first:` returned a single team (`AGENT`), so `--list` fell back to an empty Agent Operations board and hid real `IGO-*` work. Default `--list` is now **fleet-wide open issues**.

## Layers (do not collapse)

| Layer | System | Job |
|-------|--------|-----|
| Task bus | **Linear** (`https://linear.app/igorganapolsky/agent`) | Who owns which **issue** |
| File/WIP bus | **AI-Agent-Sync** vault | Who is mid-flight on which **files** |
| Code | git worktrees / PRs | Truth of product |

Human dashboard note: `~/Documents/AI-Agent-Sync/Agent-Jobs/Linear-Fleet-Dashboard.md`.

## Bridge CLI

```bash
node tools/linear-agent-bridge.js --list
node tools/linear-agent-bridge.js --list --team IGO
node tools/linear-agent-bridge.js --claim IGO-34 --agent grok
node tools/linear-agent-bridge.js --update IGO-34 --state "In Progress" --comment "…"
node tools/linear-agent-bridge.js --done IGO-34 --agent grok --comment "merged abc123"
node tools/linear-agent-bridge.js --create --title "…" --agent grok --project hermes-mobile
```

Auth: candidates from env, `~/.config/linear/api_key`, Keychain `LINEAR_API_KEY` — bridge **probes** and uses the PAT that sees the most teams (2026-08-02: Keychain-only PAT saw empty `AGENT`; file PAT sees `IGO`+`AGENT`). Prefer a full-workspace PAT in `~/.config/linear/api_key` (mode 600).

Default **create** team: `AGENT` (*Agent Operations*). Personal: `--team IGO`.  
Default **list**: all teams, open issues only (`--all` for closed).

**Claim** applies: In Progress · Linear assignee = human owner (viewer) · labels `agent-lock` + `agent-<name>` · comment · vault note under `Handoffs/linear-claims/`.

## Agent protocol

1. Session start runs `agent-session-start.js` → prints Linear fleet list (if key present).
2. Before multi-file work: **claim** Linear issue + update own `Agent-State/<agent>.md`.
3. Never edit files another agent claimed in vault without a handoff note.
4. On finish: `--done` with proof (SHA / PR URL).

## Skill

`~/.claude/skills/linear-agent-coordination/SKILL.md` (and repo `tools/linear-agent-bridge.js`).

## Why not Linear alone?

2026-07 thrashing proved multiple agents on one tree need a **local, outside-repo** ledger. Linear is cloud SSOT for *tickets*; vault is SSOT for *live file claims*.
