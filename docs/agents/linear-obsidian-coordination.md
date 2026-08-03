# Multi-Agent Coordination: Linear + AI-Agent-Sync Vault

**Updated:** 2026-08-03 (Aug 2026 deep research + proper setup)  
**Research:** [docs/RESEARCH-LINEAR-OBSIDIAN-MULTIAGENT-AUG-2026.md](../RESEARCH-LINEAR-OBSIDIAN-MULTIAGENT-AUG-2026.md)  
**Run id:** `trun_d3be5e813aa94970a1aa9fc9306812e5`

## Does Linear / Obsidian Linear improve the harness?

| Piece | Improves multi-agent coordination? | Role |
|-------|-------------------------------------|------|
| **Linear workspace** (`linear.app/igorganapolsky/agent`) | **Yes — task bus** when agents claim/release via API | Who owns which **issue** |
| **`linear-agent-bridge.js`** | **Yes — required path** | Machine-readable locks + scrub |
| **`coord-setup.js`** | **Yes — install/ensure** vault templates + doctor | One-shot setup |
| **Community Obsidian Linear plugin** | **No for locks** | Human **display** only |
| **plan.md file ownership** | Still required for megafiles | Local swarm board |
| **AI-Agent-Sync vault** | **Yes — file/WIP bus** | Mid-flight files outside git |

**Verdict:** Linear improves coordination **only if** every agent uses the bridge (`--coord-status` → `--claim` → work → `--done`). The Obsidian plugin alone does not coordinate agents.

**Aug 2026 research:** leases beat permanent locks; Linear has no atomic CAS — treat labels as soft locks, always strip on done, scrub stale, isolate via worktrees.

## Layers (do not collapse)

| Layer | System | Job |
|-------|--------|-----|
| Task bus | **Linear** | Who owns which **issue** |
| File/WIP bus | **AI-Agent-Sync** vault | Who is mid-flight on which **files** |
| Megafiles | **plan.md** | Serialize hot paths |
| Code | git worktrees / PRs | Truth of product |

## Bridge CLI

```bash
node tools/coord-setup.js
node tools/linear-agent-bridge.js --coord-status
node tools/linear-agent-bridge.js --list
node tools/linear-agent-bridge.js --claim AGENT-25 --agent grok --files tools/a.js,tools/b.js
node tools/linear-agent-bridge.js --done AGENT-25 --agent grok --comment "merged abc123"
# --done / --release STRIP agent-lock + agent-* labels

node tools/linear-agent-bridge.js --scrub-stale          # dry-run
node tools/linear-agent-bridge.js --scrub-stale --apply  # fix ghosts
node tools/obsidian-linear-sync.js                       # display board only
```

Auth: env / `~/.config/linear/api_key` / Keychain `LINEAR_API_KEY` — bridge probes broadest workspace PAT.

**Claim** applies: In Progress · human assignee · labels `agent-lock` + `agent-<name>` · comment · vault claim · structured `Agent-State/## In flight`.

**Done/Release** apply: state (done only) · **remove agent-lock labels** · vault free · `## In flight` → `(none — free)`.

## Agent protocol

1. Session start → `agent-session-start.js` → `--coord-status`.
2. Before multi-file work: **claim** + update own `Agent-State/<agent>.md`.
3. Never edit files another agent claimed in vault without a handoff.
4. On finish: `--done` with proof (SHA / PR URL) — labels must clear.
5. Megafiles still require `plan.md` ownership.
6. Periodic: `--scrub-stale` (LaunchAgent fleet loop can call later).

## Skill

`~/.grok/skills/linear-agent-coordination/SKILL.md` (and `tools/linear-agent-bridge.js`).

## Why not Linear alone?

2026-07 thrashing proved multiple agents on one tree need a **local, outside-repo** ledger. Linear is cloud SSOT for tickets; vault is SSOT for live file claims; worktrees prevent clobber.
