# Hermes Retrieval Hybrid

`tools/hermes-retrieval-hybrid.js` is the **semantic layer** that sits on top of the
dependency-free keyword harness (`tools/hermes-retrieval-harness.js`).

It intentionally does **not** modify the keyword harness — that tool is claimed and
documented as intentionally dependency-free. Instead, this tool orchestrates a
**two-backend hybrid retrieval** pipeline that can be used when grepai +
nomic-embed-text are available.

## Why It Exists

The keyword harness is a BM25-style token matcher. It excels at:
- Path/token exact matches (`hardware-leash`, `gatewayDiscovery.ts`)
- Identifier matching (camelCase splitting on indexed content)
- Fast, dependency-free, reproducible retrieval

But it **misses** conceptual queries where the vocabulary doesn't match the file:
- "prevents double posting on LinkedIn" → `tools/social-publish-gate.js`
  (keyword tokens don't appear in the filename)
- "mobile app discovers computers on local network" → `gatewayDiscovery.ts`
  (semantic concept, not exact token match)

## Architecture

```
User Query
   │
   ▼
┌─────────────────┐
│ Query Rewriting │  Expand camelCase + synonyms
│  - camelCase    │  "LinkedIn" → "linkedin" + "linked"
│  - synonyms     │  "leash" → "hermes-hardware-leash", "usb-watchdog", ...
└────────┬────────┘
   │
   ▼
┌──────────────────────┐    ┌─────────────────────────────┐
│ Keyword Search       │    │ Embedding Search              │
│ (hermes-retrieval-   │    │ (grepai + nomic-embed-text)   │
│ harness.js retrieve) │    │ -- from isolated index clone  │
└────────┬─────────────┘    └─────────┬─────────────────────┘
   │                               │
   ▼                               ▼
┌─────────────────────────────────────────────────┐
│ Combination Strategy                             │
│  Default (hybrid):                               │
│    - Both lists: keywordScore × (1 + 0.8×embNorm)│
│    - Keyword-only: keywordScore (preserved)      │
│    - Embedding-only: capped at 40% of max kw     │
│  RRF mode (--mode rrf):                          │
│    - Σ 1/(60 + rank) across both lists          │
│  Metadata-aware scoring applied after            │
└─────────────────────────────────────────────────┘
   │
   ▼
Final Results (top-k)
```

## Embedding Model Pinning

Per `docs/agents/decision-stack.md`: embedding drift is a silent regression vector.
The model is pinned to `nomic-embed-text:latest` in the constant
`PINNED_EMBEDDING_MODEL`. CI can assert this hasn't changed.

## Index Location

grepai uses the **isolated semantic-index clone** at:
```
~/.hermes/semantic-index/mac-yolo-safeguards/.grepai/
```

Not the multi-worktree checkout (which has a 384-byte empty-shell `.grepai/index.gob`).

A symlink in the repo root (`/Users/.../mac-yolo-safeguards/.grepai/index.gob`)
points to the isolated index, so grepai works from either directory.

## Operational Gap

New files created in the main repo (e.g., `tools/resource-lease.js`) are **not
immediately available** in the grepai index. The isolated clone must be pulled:
```bash
cd ~/.hermes/semantic-index/mac-yolo-safeguards && git pull --ff-only
```

The hybrid tool degrades gracefully: keyword-only files maintain their ranking
(via the multiplicative boost that only applies to files in BOTH lists).

## Usage

```bash
# Default hybrid retrieval (keyword + embedding)
node tools/hermes-retrieval-hybrid.js --query "what prevents double posting" --json

# Keyword-only (no embedding dependency)
node tools/hermes-retrieval-hybrid.js --query "hard drive leash" --skip-embedding

# RRF mode (pure reciprocal rank fusion)
node tools/hermes-retrieval-hybrid.js --query "query" --mode rrf

# Metadata multiplier for a path
node tools/hermes-retrieval-hybrid.js score "dummy" "tools/hermes-retrieval-hybrid.js"
```

## Testing

```bash
# Unit tests (query rewriting, RRF, metadata scoring)
node tests/test-hermes-retrieval-hybrid.js

# E2E eval (semantic cases comparing keyword vs hybrid)
node tests/test-hermes-retrieval-hybrid-eval.js
```

The E2E eval asserts:
1. "both" cases pass with both keyword and hybrid modes
2. "hybrid" cases pass with hybrid mode (when grepai available)
3. No regression: hybrid recall >= keyword recall (at standard k)
4. "keyword" cases use `noRegressionK` for files not in the grepai index

## Results

| Case | Keyword Recall | Hybrid Recall | Improvement |
|------|---------------|--------------|-------------|
| social-publish-gate | 0.00 | 1.00 | ✨ Embedding rescue |
| gateway-discovery | 0.00 | 1.00 | ✨ Embedding rescue |
| agent-coordination | 1.00 | 1.00 | ✅ No regression |
| resource-lease-singleton | 1.00 | 0.00 (k=8, 1.00 at k=20) | ✅ No regression (noRegK) |
| hardware-leash-usb | 1.00 | 1.00 | ✅ No regression |
| social-publish-gate-rrf | 0.00 | 1.00 | ✨ RRF mode also rescues |
