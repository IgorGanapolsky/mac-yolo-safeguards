---
name: hermes-context-search
description: >
  Local, incremental, multi-repo semantic code search across Igor's repos
  (mac-yolo-safeguards, hermes-mobile, hermes-eval, skool_top1percent,
  business-os-revenue, ...) via `hermes-context`, built $0/local using Ollama's
  nomic-embed-text — the fleet's own version of JetBrains Context (2026-07).
  Use BEFORE cold grep/find exploration of an unfamiliar repo, or when a
  question spans multiple repos at once ("where do we handle X across the
  fleet"). Do NOT use for a repo you already know well or a single obvious
  file lookup — plain Grep is faster there.
---

# hermes-context: multi-repo semantic search

## When to invoke

- A task touches a repo you have not explored yet this session, and a targeted
  grep query isn't obvious (concept search, not string search).
- A question spans MULTIPLE repos ("where else in the fleet do we handle
  gateway fallback routing") — `hermes-context search` queries every indexed
  repo at once, including ones not currently checked out in this session.
- Do NOT invoke for a single known file/symbol lookup, or a repo already
  loaded into context this session — Grep/Glob are faster and free of the
  (still real, un-optimized) embedding-index latency below.

## Commands

```
hermes-context index /path/to/repo [--name X]     # (re)build the index; incremental — unchanged files are never re-embedded
hermes-context search "concept or question" [--repo X] [--top N] [--json]
hermes-context list                               # which repos are indexed, chunk counts
hermes-context doctor [--json]                     # ollama up? model pulled? which repos indexed?
```

Index storage: `~/.hermes/context-index/<repo-name>.{jsonl,meta.json}` (private,
0600). Nothing is ever sent anywhere but the local Ollama daemon — this is a
$0, fully offline tool, unlike JetBrains Context (which is free with a
JetBrains AI subscription but not local-only).

## Honest limitations (verified 2026-07-24, do not oversell)

- `nomic-embed-text`'s context window is 2048 tokens. A first version chunked
  by line-count alone and hit real HTTP 500s ("input length exceeds the
  context length") on a dense/near-minified CSS file in
  `apps/hermes-control-plane/app/globals.css` — chunks were silently dropped.
  Fixed same-day: chunking is now also char-budget-bounded (4000 chars,
  `--max-chunk-chars` to override), AND any chunk that still 500s is
  automatically bisected and retried (`embed_with_split`) rather than
  dropped — verified with a live repro against the real model, and a
  hermetic test simulates the 500 to keep it from regressing silently.
- Indexing is **sequential, one HTTP embedding call per ~60-line chunk** — a
  large repo (hundreds of tracked files) can take many minutes to first-index.
  JetBrains' published "up to 68% fewer turns / 59% latency / 48% cost"
  numbers are THEIR benchmark, not verified against this implementation; treat
  this tool as directionally useful (fewer blind grep passes), not as a
  guaranteed speed multiplier.
- Re-indexing an already-indexed repo IS fast — unchanged files (by sha256)
  are never re-embedded, only new/changed files are.
- Search itself is fast (one query embedding + in-memory cosine scan).
- A repo must be indexed at least once while checked out locally before it's
  searchable — this does not (yet) discover repos it has never seen, unlike
  JetBrains' org-wide multi-repo discovery.

## If the doctor reports not-ok

- `ollamaUp: false` → the local Ollama daemon isn't running; nothing else here
  will work until it is.
- `modelAvailable: false` → `ollama pull nomic-embed-text` (already pulled on
  this fleet as of 2026-07-24; only relevant on a fresh machine).
