# Graphify vs grepai vs JetBrains Context — RAG partition guide

**Added:** 2026-07-24 (`T-CONTEXT-INTELLIGENCE-ROI-20260724`)
**Status:** Decision-routing doc. Grafify + grepai are wired and free; JetBrains Context is **not** adopted (no license on this machine — see Gate 1 below).

This is a *routing* doc — which retrieval tool to reach for and when. It does **not** re-document
install steps (those live in [`LOCAL-SEMANTIC-CODE-INDEX.md`](./LOCAL-SEMANTIC-CODE-INDEX.md) for
grepai and the Graphify skill for graphify). It exists to prevent the "two-RAG" anti-pattern:
running semantic and AST retrieval on the same query and getting two overlapping, unreconciled
answers.

## TL;DR routing table

| Question shape | Use | Why |
|---|---|---|
| "Which files import X?" / "What calls `foo()`?" / shortest path A→B | **Graphify** (`path`, `explain`, `query`) | Deterministic, AST-grounded, zero ambiguity. Symbol-level. |
| "Where's the reconnect-backoff logic?" (natural language, meaning not literal string) | **grepai** (`grepai search "..."`) | Semantic vector match finds the code by *meaning* even when the literal string is absent. |
| "Show me the function and its neighbors explained plainly" | **Graphify** (`explain`) | Graph traversal gives structural context a vector search can't. |
| "Is this a frontend/backend/cross-cutting concern?" | **grepai** then **Graphify** (in that order) | Semantic first to locate, graph second to confirm structure. Never reverse — the graph is the ground truth, the vector is the hypothesis. |
| Multi-repo ("does Hermes Mobile depend on control-plane types?") | **Graphify `merge-graphs`** *(if both graphs built)* | Cross-repo dependency graph. **Currently blocked: only root graph is built** — see below. |

## The three tools, honestly

### 1. Graphify (AST knowledge graph) — wired, root graph built
- Binary: `.graphify-venv/bin/graphify`
- Graph: `graphify-out/graph.json` (built 2026-07-24, ~158MB, root repo only)
- Commands that matter: `query`, `path "A" "B"`, `explain "X"`, `update`, `merge-graphs`, `merge-driver`
- **Strength:** deterministic symbol/dependency graph. "What imports X" is a graph traversal, not a guess.
- **Limitation:** no semantic/NL matching. "Where's the reconnect logic" returns nothing if no symbol is named that.
- Per `AGENTS.md`: run `graphify update .` after code edits (when the graph already exists) to keep it current — AST-only, no API cost.

### 2. grepai (local semantic vector index) — wired
- Installed via brew (`yoanbernabeu/tap/grepai`), served over MCP from an isolated clone at `~/.hermes/semantic-index/mac-yolo-safeguards`.
- Uses `nomic-embed-text` (Ollama, already on this Mac). **$0/month.**
- **Strength:** finds code by meaning. `grepai search "reconnect retry timer"` surfaces `GatewayContext.tsx` even though that exact string isn't in the file.
- **Limitation:** indexes `main` only (not live WIP branches); first build is slow under load; no auto-refresh.
- Full install + gotchas (the worktree-fanout trap): [`LOCAL-SEMANTIC-CODE-INDEX.md`](./LOCAL-SEMANTIC-CODE-INDEX.md).

### 3. JetBrains "Context" (semantic repo intelligence, paid) — NOT adopted
- **Gate 1 BLOCKED (2026-07-24):** `which jbcontext` → not found. No `~/.jbcontext`. The JetBrains runtime **is** present (`~/Library/Application Support/JetBrains/Air` — JetBrains "Air" editor is installed, with an `openai` localStorage dir), but Context specifically requires the `jbcontext` CLI + a JetBrains AI subscription, neither of which is confirmed provisioned on this machine.
- This is the honest state. Do **not** fabricate auth or attempt install without a confirmed license.
- **If/when licensed:** Context would slot into the grepai lane (semantic NL lookup) but with JetBrains' claimed multi-repo + claimed −68% turns / −59% latency / −48% cost. Until then, grepai covers that lane for free. The installed JetBrains Air runtime is a candidate adoption path if Igor's JetBrains account has AI credits — verify via the Air app's account settings, not by guessing.

## The multi-repo gap (usage, not capability)

Graphify **already supports** cross-repo graphs:
```
graphify merge-graphs <g1> <g2> [--out merged.json]
graphify merge-driver <base> <current> <other>   # git merge driver
```
The gap is that **only the root repo has a built `graph.json`** today. Neither
`hermes-mobile/graphify-out/graph.json` nor `apps/hermes-control-plane/graphify-out/graph.json`
exists. So there is nothing to merge *yet*. A multi-repo query helper would be speculative
scaffolding with no inputs — that's why `T-CONTEXT-INTELLIGENCE-ROI-20260724` deliberately did not
build one.

**To close the gap when it's real:** run `graphify update` inside each sub-repo to build their
graphs, then `merge-graphs` them. No new tool needed.

## The anti-pattern to avoid

Never run grepai and Graphify on the *same* query and present both as independent answers. They
answer different questions:
- Graphify = "what is structurally connected" (ground truth)
- grepai = "what is semantically similar" (hypothesis)

If they disagree, the **graph wins** for structural claims (imports, call sites, paths); the
**vector wins** for "where would a human look for this concept." State which lens you used when
you cite a result — don't let the two blur into an ungrounded "the codebase says."

## Related
- [`docs/LOCAL-SEMANTIC-CODE-INDEX.md`](./LOCAL-SEMANTIC-CODE-INDEX.md) — grepai install, evaluation table, worktree gotcha
- [`AGENTS.md`](../AGENTS.md) § graphify — when to use graphify query/path/explain vs raw grep
- `tools/agent-cost-analyzer.js` — measures fleet cost/latency (the "$" denominator the swarm harness names)
