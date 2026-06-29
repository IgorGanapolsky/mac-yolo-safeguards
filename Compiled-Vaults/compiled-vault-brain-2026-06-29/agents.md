---
type: "agent-directive"
source_status: "source-backed"
last_verified: "2026-06-29T13:49:05.760Z"
---
# AGENTS

## Universal Rule

Before any agent acts, read this file, SOURCE-MANIFEST.md, and the relevant
context pack. If the task touches the repo, read the live repo AGENTS.md and
plan.md too.

## LLM Operating Modes

- **Codex / code agents:** use repo source, run tests, cite files and commands.
- **Claude / Gemini / GPT:** use context packs for reasoning, but do not claim
  local execution unless a tool actually ran.
- **Ollama / local models:** use compact context packs and avoid browser or
  external connector assumptions.
- **Obsidian AI Agent:** edit vault notes only when asked; repo work still uses
  plan.md claims and git evidence.
- **Hermes:** coordinate actions through sync packets, experiment loops, and
  approval gates.

## Stop Gates

- Another agent owns the target file.
- Worktree has unowned dirty changes in the target path.
- The requested action would send, charge, refund, publish, deploy, merge, or
  kill an unknown process without approval.
- The answer would claim revenue, delivery, CI pass, external send, or release
  without provider/source evidence.
