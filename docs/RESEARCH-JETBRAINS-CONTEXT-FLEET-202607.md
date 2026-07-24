# Research: JetBrains Context vs fleet local repo intelligence (2026-07)

**Run:** parallel-cli deep research `trun_fc3268d892f541d6810050e3ed7bb566` (2026-07-24)  
**Plus:** JetBrains blog, JetBrains Context landing, grepai docs, live Mac audit.

## What JetBrains Context is

JetBrains Context ([announcement](https://blog.jetbrains.com/ai/2026/07/introducing-jetbrains-context-repository-intelligence-for-coding-agents/)) is a **repository intelligence layer for coding agents**:

- Incremental semantic index of repo(s)
- Agent tools for semantic Q&A / related code (not only keyword grep)
- Hooks into Claude Code, Codex CLI, Junie; usable from IDEs / VS Code / etc.
- Claimed benchmark gains: up to **~68% fewer turns**, **~59% lower latency**, **~48% lower cost**
- Early access with **JetBrains AI** subscription; CLI: `jbcontext login`, `setup-agent`, `index`, `analyze`
- Marketing claim: **source code is not stored on JetBrains Context servers** (still verify against current ToS before enterprise use)

**On Igor's Mac (2026-07-24):** `jbcontext` is **not installed**. No official JetBrains Context fleet setup.

## Problem it solves (our fleet)

| Pain | Why agents thrash |
|------|-------------------|
| Cold grep/find on mega monorepo | Token burn, wrong files, slow |
| Many worktrees (~100+) | Naive watchers index everything |
| Many agents (Claude, Cursor, Grok, Codex, …) | Each re-discovers the same map |
| Multi-repo (mac-yolo, hermes-eval, AnswerGuard, …) | No shared “where does X live?” |

## Decision (fleet)

| Option | Verdict |
|--------|---------|
| **JetBrains Context (`jbcontext`)** | Optional later if Igor has JetBrains AI and wants vendor analytics. **Not primary:** not installed, paid/subscription coupling, not required for local fleet. |
| **grepai** (local Ollama + GOB, MCP) | **Primary SSOT** for mac-yolo-safeguards semantic search. Already indexed (~1600 files / ~9k chunks). |
| **hermes-context** (multi-repo Ollama) | **Cross-repo** layer (multiple git roots, one CLI). |
| **graphify** | Structure/path queries when `graphify-out/graph.json` exists — complement, not replacement. |
| **grepai workspace (Postgres/Qdrant)** | Skip for now — extra services; hermes-context covers multi-repo without DB. |

**Do not** run `grepai watch` from the live multi-worktree checkout — it fans out to all worktrees and hammers Ollama. Index only from **isolated plain clones** under `~/.hermes/semantic-index/<name>`.

## Architecture (shared, all local agents)

```
~/.hermes/semantic-index/
  mac-yolo-safeguards/   # plain clone of main + .grepai/ + watch daemon
  hermes-eval/           # optional additional clones
~/.hermes/context-index/ # hermes-context multi-repo embeddings

MCP (stdio, Mac-local only):
  grepai mcp-serve ~/.hermes/semantic-index/mac-yolo-safeguards

LaunchAgent com.igor.fleet-repo-intelligence:
  daily: git pull clones + ensure grepai watch + hermes-context reindex

Session start:
  node tools/fleet-repo-intelligence-status.js  # print health for every agent
```

Cloud agents (Replit, etc.) **cannot** use local grepai MCP — they keep using GitHub/context7 remotes.

## Agent wiring (all agents benefit)

| Agent | How it gets intelligence |
|-------|---------------------------|
| Claude Code / Cursor / Grok (local) | Repo `.mcp.json` → `grepai`; session-start status; skill/rule “search semantic index first” |
| Codex / Antigravity / Gemini | Same MCP if they load repo `.mcp.json`; AGENTS.md rule; CLI `grepai search` / `hermes-context search` |
| Hermes yolo fleet | `hermes-context search` CLI (already on PATH) |
| Obsidian vault | Handoff notes + status; not the vector store |

## Install / verify

```bash
bash tools/install-fleet-repo-intelligence.sh
node tools/fleet-repo-intelligence-status.js --json
cd ~/.hermes/semantic-index/mac-yolo-safeguards && grepai search "USB reverse pair"
```

## Honesty

- Index ≈ **origin/main** (isolated clone), not every WIP worktree tip.
- First full embed is slow under high load; incremental is cheap.
- This is **not** a substitute for reading the file you will edit.
- Official JetBrains Context remains optional if product/subscription later desired.
