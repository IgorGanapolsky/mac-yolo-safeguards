---
name: knowledge-graph-fuse
description: >
  Always fuse grepai/harness search hits with bounded graphify traversal.
  Retrieval quality is a system property, not question wording. Do not route
  wiki-vs-graph by keywords. Do not clone Cosmos Gremlin or Azure. Trigger:
  knowledge layer, graph you actually traverse, GraphRAG, graphify vs grepai,
  multi-hop retrieval, TDS Cekikj. Slash: /knowledge-graph-fuse.
---

# Always fuse; never route by wording

Source: [Making the Knowledge Layer a Graph You Actually Traverse](https://towardsdatascience.com/making-the-knowledge-layer-a-graph-you-actually-traverse/) (Cekikj, TDS 2026-08-20).

They store relationships then consult them like a filing cabinet. We had the same smell: `grepai` for intent, `graphify query` only for “architecture” questions — a router.

```bash
node tools/knowledge-graph-fuse.js --hits-file hits.json --graph graphify-out/graph.json --ablate --json
```

## Steal

1. **Fixed pipeline** — search hits (anchors) then 1–2 hop traversal, then RRF. No wiki-first / graph-only caller mode.
2. **Retriever vs filter** — graph expands; time filters. graphify AST edges have no `valid_from` — say so, do not invent a time-series DB.
3. **Ablation is the acceptance test** — `--ablate` reports extra files/paths fusion adds vs search-only.
4. **Keep the gate** — `contradicts` edges → `declinesToSettle=true`; do not pick a side.

## Never

- Cosmos DB Gremlin / Azure Foundry / insurance ontology
- LLM gray-zone entity resolution
- `--harness-only` as the default (that is the retired router)
- Treating Graphify HTML as retrieval

## Related

`tools/knowledge-graph-fuse.js` · `tools/retrieval-dual-path.js` · `docs/agents/code-search.md`
