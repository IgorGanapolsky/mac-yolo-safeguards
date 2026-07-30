# Retrieval stack upgrade — 2026-07-30

Honest scorecard + tools shipped to close gaps without claiming best-in-class.

## Checklist status after this change

| Capability | Before | After |
|------------|--------|--------|
| Better chunking | grepae 512/50; harness file-level | + **parent–child windows** on large harness files (80-line windows) |
| Better metadata | path boosts only | path boosts + **`--path-include` / `--path-exclude`** filters |
| Metadata filtering | weak | dual-path + harness filters |
| Hybrid BM25+vector | grepae on | grepae on + **dual-path RRF fuse** with sparse harness |
| Reranking | none | **RRF fuse** (list agreement = soft rerank; not cross-encoder) |
| Better embeddings | grepae nomic; lessons fake | grepae unchanged; lessons FTS repair (vector still package-side) |
| Query rewriting | none | **deterministic synonym rules** (`retrieval-query-rewrite.js`) |
| Parent–child | none | **harness windows** |

## Tools

```bash
# Deterministic rewrite
node tools/retrieval-query-rewrite.js --query "session not found" --json

# Dual path: harness sparse + grepae hybrid → RRF
node tools/retrieval-dual-path.js --query "session not found" --json --limit 10

# Optional rewrite + path filter on harness alone
node tools/hermes-retrieval-harness.js retrieve --query "tailscale" --rewrite --path-include "hermes-mobile/,tools/" --json

# Lessons FTS drift repair (dry-run default)
node tools/thumbgate-lessons-repair.js --dir ~/.thumbgate/projects/default
node tools/thumbgate-lessons-repair.js --dir ~/.thumbgate/projects/default --apply

# Doctors / canaries
node tools/thumbgate-lessons-doctor.js --json
node tools/grepai-index-canary.js --live --json
node tools/rag-retrieval-eval.js
```

## Lessons vector gap (not fully closed here)

Neural re-embed of lessons + LanceDB populate still belongs in the **ThumbGate package**.
This repo ships:

1. **Detector** — `thumbgate-lessons-doctor.js`
2. **FTS repair** — `thumbgate-lessons-repair.js` (sqlite ledger → FTS)

## Measured (harness golden set)

Run `node tools/rag-retrieval-eval.js` after merge — must stay ≥ prior floors (recall/MRR/nDCG).
Do not lower floors to land this PR.
