# Agent Sync Brief

`tools/agent-sync-brief.js` writes a deterministic Markdown and JSON packet that
all agents can consume through plain files. This is the repo-side bridge for
Codex, Claude, Cursor, Gemini, Hermes, and Obsidian AI Agent.

## Contract

- Source of truth remains `AGENTS.md` plus `plan.md`.
- Generated packets default to `artifacts/agent-sync/`, which is gitignored.
- Obsidian export is optional via `--vault`; it writes an ordinary note under
  `AI Agents/Hermes Agent Sync.md` plus a sibling JSON file.
- The packet is bounded: git status, plan tasks, file locks, recent decisions,
  latest continuous E2E proof, LaunchAgent state, and source mtimes.
- The packet redacts common token forms before writing Markdown or JSON.

## Usage

```bash
node tools/agent-sync-brief.js
node tools/agent-sync-brief.js --json
node tools/agent-sync-brief.js --vault "$HOME/Documents/ObsidianVault"
node tools/agent-sync-brief.js --stdout --no-write
```

## Stop Gates

Agents must stop or mark blocked when the packet shows:

- a blocked `plan.md` task in the target area
- an active file lock owned by another agent
- a dirty unowned file in the target path
- missing verification for fixed, shipped, sent, paid, or CI-passing language

The packet is sync evidence, not business outcome evidence. It cannot prove that
money was made, a message was sent, a PR was merged, or a release was published.
