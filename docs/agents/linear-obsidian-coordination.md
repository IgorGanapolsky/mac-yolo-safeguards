# Multi-Agent Coordination: Linear + AI-Agent-Sync Vault

**Updated:** 2026-08-26

## Does Linear / Obsidian Linear improve the harness?

| Piece | Improves multi-agent coordination? | Role |
|-------|-------------------------------------|------|
| **Linear workspace** (`linear.app/igorganapolsky/agent`) | **Yes — as task bus** when agents claim/release via API | Who owns which **issue** |
| **`linear-agent-bridge.js`** | **Yes — required path** for agents (claim/list/done + vault note) | Machine-readable locks |
| **`linear-workspace-hygiene.js`** | **Yes — read-only provider audit** | Projects, labels, cycles, statuses, agents, links, and stale-candidate blockers |
| **Community [Obsidian Linear plugin](https://community.obsidian.md/plugins/linear)** | **No for locks** | Human **display** only (embed/filter issues in notes) |
| **plan.md file ownership** | Still required in-repo for megafile claims | Local agent swarm board |
| **AI-Agent-Sync vault** | **Yes — file/WIP bus** | Mid-flight files outside git |

**Verdict:** Linear improves intelligent coordination **only if** every agent uses the bridge (`--list` → `--claim` → work → `--done`). The Obsidian plugin alone does not coordinate agents; install it for your dashboard, not as SSOT.

**Bug fixed 2026-08-02:** Linear GraphQL `teams` without `first:` returned a single team (`AGENT`), so `--list` fell back to an empty Agent Operations board and hid real `IGO-*` work. Default `--list` is now **fleet-wide open issues**.

**Bug fixed 2026-08-26:** the AGENT team grew beyond the first label page. `agent-lock` was omitted from `team.labels`, duplicate creation failed silently, and claims could receive attribution without a lock. Required claim labels now use paginated `issueLabels` readback; a claim fails closed unless both `agent-lock` and `agent-<name>` are present after update.

## Linear Basic plan boundary

Live provider readback on 2026-08-26 returned subscription type `basic_monthly_12`, one seat, and enabled Linear Agent/agent automation/coding agent flags. The automation must continue to read this value rather than assume it.

Per [Linear pricing](https://linear.app/pricing), Basic includes five teams, unlimited issues and file uploads, admin roles, the core issue/project/cycle/initiative surface, API/webhook access, Agent platform, MCP access, and Linear Agent. Loops, Insights, Triage Intelligence, Code Intelligence, and Linear Asks remain Business-plan features. Do not schedule Loops on Basic or claim those Business capabilities from local scripts.

## Layers (do not collapse)

| Layer | System | Job |
|-------|--------|-----|
| Task bus | **Linear** (`https://linear.app/igorganapolsky/agent`) | Who owns which **issue** |
| File/WIP bus | **AI-Agent-Sync** vault | Who is mid-flight on which **files** |
| Code | git worktrees / PRs | Truth of product |

Human dashboard note: `~/Documents/AI-Agent-Sync/Agent-Jobs/Linear-Fleet-Dashboard.md`.

## Bridge CLI

```bash
# Preferred session start (Linear locks + vault Agent-State + ghost detection)
node tools/linear-agent-bridge.js --coord-status

node tools/linear-agent-bridge.js --list
node tools/linear-agent-bridge.js --list --team IGO
node tools/linear-agent-bridge.js --claim AGENT-25 --agent grok --files tools/a.js,tools/b.js
node tools/linear-agent-bridge.js --done AGENT-25 --agent grok --comment "merged abc123"
node tools/linear-agent-bridge.js --create --title "…" --agent grok --project hermes-mobile --team AGENT

# Authenticated provider inventory and deterministic, mutation-free hygiene plan
node tools/linear-workspace-hygiene.js --inventory --json
node tools/linear-workspace-hygiene.js --dry-run --stale-days 90 --json

# Reviewed prompts for personal/team Linear Agent skills
node tools/linear-agent-skill-exporter.js --json
```

Auth: candidates from env, `~/.config/linear/api_key`, Keychain `LINEAR_API_KEY` — bridge **probes** and uses the PAT that sees the most teams (2026-08-02: Keychain-only PAT saw empty `AGENT`; file PAT sees `IGO`+`AGENT`). Prefer a full-workspace PAT in `~/.config/linear/api_key` (mode 600).

HTTP: 25s timeout + retries on NETWORK (was hanging / false NETWORK on Done). Team GraphQL uses `ID!`.

Default **create** team: `AGENT` (*Agent Operations*). Personal: `--team IGO`.  
Default **list**: all teams, open issues only (`--all` for closed).

**Claim** applies and reads back: In Progress · Linear assignee = human owner (viewer) · labels `agent-lock` + `agent-<name>` · comment · vault note under `Handoffs/linear-claims/`. Missing required labels are an error, not a partial success.

## Safe workspace hygiene

`linear-workspace-hygiene.js` follows every provider connection page, rejects divergent duplicate IDs and stalled cursors, and emits a stable fingerprint. It joins issue references with GitHub issue/PR URLs and canonical vault claims.

The tool has no apply/archive/delete mode. It may nominate a completed, stale, unreferenced object for **review**, but blocks active/recent work, open issues, current/future cycles, GitHub-linked history, Obsidian claim history, and coordination labels. Provider users/agents are always manual-review-only. Any later mutation requires separate authorization and immediate provider readback.

## Agent protocol

1. Session start runs `agent-session-start.js` → `--coord-status` (Linear + vault).
2. Before multi-file work: **claim** Linear issue + update own `Agent-State/<agent>.md`.
3. Never edit files another agent claimed in vault without a handoff note.
4. On finish: `--done` with PR URL, merge SHA, and exact-head CI URL. The bridge does not compute cycle time; do not invent it.
5. Megafiles still require `plan.md` ownership (Linear does not replace it).

## Skill

`~/.claude/skills/linear-agent-coordination/SKILL.md` (and repo `tools/linear-agent-bridge.js`).

## Why not Linear alone?

2026-07 thrashing proved multiple agents on one tree need a **local, outside-repo** ledger. Linear is cloud SSOT for *tickets*; vault is SSOT for *live file claims*.
