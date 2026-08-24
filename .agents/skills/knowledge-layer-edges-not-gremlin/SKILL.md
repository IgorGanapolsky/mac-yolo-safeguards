---
name: knowledge-layer-edges-not-gremlin
description: >
  Cekikj TDS residual on top of always-fuse: two-threshold alias entity
  resolution (gray zone = needs_review, not LLM), bitemporal expire-and-open,
  ingest-time contradiction. Do not clone Cosmos Gremlin or dual-edit PR #2029.
  Trigger: bitemporal edges, two-threshold entity resolution, ingest
  contradiction, knowledge layer traverse. Slash: /knowledge-layer-edges-not-gremlin.
---

# Knowledge-layer edges — not Gremlin

Source: [Making the Knowledge Layer a Graph You Actually Traverse](https://towardsdatascience.com/making-the-knowledge-layer-a-graph-you-actually-traverse/) (Cekikj, TDS 2026-08-20).

Always-fuse (search anchors → 1–2 hop → RRF) is **grok PR #2029**. Do not dual-edit `tools/knowledge-graph-fuse.js`.

```bash
node tools/knowledge-layer-edges.js --ablate --json
node tests/test-knowledge-layer-edges.js
```

## Steal (this slice)

1. Two thresholds — auto `same_as` / `create`; gray zone is `needs_review`.
2. Time lives on **our** overlay edges (`validFrom`/`validTo`). Expire, do not rewrite.
3. Ingest contradiction — different authorities, both current → `declinesToSettle`.

## NEVER / ALWAYS

| NEVER | ALWAYS |
| --- | --- |
| Cosmos DB Gremlin / Azure Foundry | Local JSON overlay |
| LLM gray-zone adjudication | `needs_review` |
| Dual-edit PR #2029 fuse files | Complement |
| Treat graphify AST as bitemporal | Say AST has no validity window |
| Insurance/Ostermere ontology | ThumbGate hosted concepts only |

## Related

`/knowledge-graph-fuse` · `tools/knowledge-layer-edges.js`
