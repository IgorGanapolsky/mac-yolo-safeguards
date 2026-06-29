---
type: "context-pack"
scope: "Token-efficient LLM context selection"
source_status: "source-backed"
last_verified: "2026-06-29T13:49:05.760Z"
tags:
  - "llm"
  - "token-efficiency"
  - "arena"
---
# Token Efficiency Context

## Why This Exists

Agent Arena-style evaluation rewards useful work per token, not just raw task
completion. Hermes should load the smallest source-backed pack that can answer
the task, then fetch targeted source files only when needed.

## Context Budget Rules

- Start with README.md, AGENTS.md, and one task-specific context pack.
- Do not paste broad source dumps when a source manifest plus targeted excerpt
  is enough.
- Prefer JSON state for machine routing and Markdown packs for reasoning.
- If a pack exceeds the model's useful context window, ask the repo tools for a
  narrower source query instead of truncating blindly.
- Report evidence density: source files used, commands run, and tokens avoided
  when possible.

## Source Token Estimates

| Source | Exists | Est. Tokens | Recommendation |
|--------|--------|-------------|----------------|
| agent-directives | yes | 3110 | use only when directly relevant |
| coordination-board | yes | 6821 | use excerpt or targeted source query |
| obsidian-index | yes | 650 | safe for compact prompt |
| agent-sync-brief-doc | yes | 352 | safe for compact prompt |
| recursive-loop-doc | yes | 1314 | safe for compact prompt |
| loop-engine-doc | yes | 950 | safe for compact prompt |
| latest-e2e | yes | 80 | safe for compact prompt |
| skool-restaurant-answering-doc | yes | 318 | safe for compact prompt |
| skool-restaurant-answering-code | yes | 1302 | safe for compact prompt |

## Provenance

- SOURCE-MANIFEST.md
- Public Arena signal: token efficiency in agent evaluation
