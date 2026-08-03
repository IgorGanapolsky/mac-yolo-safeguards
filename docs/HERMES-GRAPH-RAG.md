# Hermes Graph RAG — local dual-layer memory for autonomous agents

**Added:** 2026-08-03  
**Tool:** [`tools/hermes-graph-rag.js`](../tools/hermes-graph-rag.js)  
**Tests:** [`tests/test-hermes-graph-rag.js`](../tests/test-hermes-graph-rag.js)

## Why not Microsoft GraphRAG / full LightRAG / Neo4j first?

For a **local Hermes agent on an M-series Mac Pro** with a hard **$0–$100/mo** model budget:

| Approach | Local fit | Cost / ops risk |
|---|---|---|
| Microsoft GraphRAG (community reports, offline Leiden) | Poor for live agent memory | 10–50× index tokens; full rebuilds |
| LightRAG (HKU) | Strong dual-layer design | Python stack + LLM extraction unless carefully local-only |
| Graphiti + Neo4j | Best temporal event streams | Docker Neo4j always-on; more ops |
| **Hermes Graph RAG (this tool)** | Best default for this repo | Deterministic extract, mtime incremental, JSON store under `~/.hermes` |

This tool implements the **LightRAG ideas that matter** (dual graph+chunk retrieval, incremental updates, pre-action routing) **without** pulling a second Python framework into the Hermes ship path. Graphify remains the **AST code graph**; this tool is the **ops/business knowledge graph** with an optional Graphify overlay.

## Architecture

```
Corpus (docs/, coordination/, AGENTS.md, optional Obsidian vault)
        │
        ▼  deterministic extract (wiki links, headings, symbols, tags)
┌───────────────────┐     ┌────────────────────┐
│ Entity graph      │     │ Text chunks         │
│ nodes + edges     │     │ section-linked      │
└─────────┬─────────┘     └──────────┬─────────┘
          │   optional graphify-out/graph.json AST overlay
          ▼                          ▼
     Pre-action GATE ──► entity | multi_hop | semantic
          │
          ├─ entity     → 1-hop neighbors only (no cloud for lookup)
          ├─ multi_hop  → BFS depth 2 + chunk fusion
          └─ semantic   → prefer hermes-retrieval-hybrid / harness;
                           graph boost when entities matched
```

## Storage

```
~/.hermes/graph-rag/<repo-slug>/index.json
```

- Versioned JSON (`version: 1`)
- Per-file `mtimeMs` + `size` for **instant incremental** skips
- No server process; mirrors Hermes SessionDB “local file, zero footprint” posture

Override store: `--store PATH` or `HERMES_GRAPH_RAG_STORE`.

## Commands

```bash
# Build / refresh (mtime incremental)
node tools/hermes-graph-rag.js index
node tools/hermes-graph-rag.js index --vault "$HOME/Documents/AI-Agent-Sync"

# Pre-action safety gate (agent routers should call this first)
node tools/hermes-graph-rag.js gate --query "how does leash relate to pair" --json

# Retrieve with hop expansion
node tools/hermes-graph-rag.js retrieve --query "thumbgate continuity ownership" --json

# Status
node tools/hermes-graph-rag.js status --json
```

## Pre-action safety gate

| Mode | When | Backend | Cloud LLM for retrieval? |
|---|---|---|---|
| `entity` | Short / “what is X” + strong entity match | Graph 1-hop | **No** |
| `multi_hop` | “how does A relate to B”, depends/path/timeline | Graph BFS + chunks | Retrieval local; synthesis optional |
| `semantic` | Default NL | Keyword + embedding hybrid | Prefer local `nomic-embed-text` via grepai |

Agent routing block should:

1. `gate --query … --json`
2. If `gate.skipExternalLlmForLookup` → return graph matches only
3. Else run `hermes-retrieval-hybrid` / harness and merge `graph` boost paths when `gate.runGraph`

## Relation to existing stack

| Layer | Tool | Role |
|---|---|---|
| Keyword | `hermes-retrieval-harness.js` | BM25-style, dependency-free |
| Embedding | `hermes-retrieval-hybrid.js` + grepai + `nomic-embed-text` | Semantic rescue |
| Code AST graph | Graphify `graphify-out/graph.json` | Imports/calls (deterministic) |
| Ops/business graph | **hermes-graph-rag.js** | Wiki/ops/handoff relations + gate |

See also: [`GRAPHIFY-CONTEXT-RAG-PARTITION.md`](./GRAPHIFY-CONTEXT-RAG-PARTITION.md), [`HERMES-RETRIEVAL-HARNESS.md`](./HERMES-RETRIEVAL-HARNESS.md).

## What we deliberately did **not** install

- **Neo4j / Graphiti** — add only if you need true temporal invalidation of business events at volume; Docker tax is real on a thrashing Mac.
- **LightRAG pip package** — design adopted; full package deferred until a pure-local extract profile is proven under Hermes CI.
- **Cloud embedding APIs** — use Ollama `nomic-embed-text` (already on this Mac) for any vector path.

## Later upgrades (optional)

1. Local Ollama LLM extract (entity/relation JSON) behind a flag — still $0, slower index.
2. LanceDB sidecar for chunk vectors (embedded Rust) if grepai is unavailable.
3. Graphiti episode stream for Stripe/order/event timelines only — keep Neo4j off the critical path for code RAG.

## Acceptance

```bash
node tests/test-hermes-graph-rag.js
node tools/hermes-graph-rag.js index --no-graphify
node tools/hermes-graph-rag.js gate --query "what is thumbgate" --json
```
