---
name: search-as-code
description: >
  Perplexity-inspired Search-as-Code (SaC) Agentic Search SDK and sandboxed
  retrieval engine. Replaces monolithic tool calling with programmable retrieval
  pipelines: parallel fan-out, BM25 + RRF reranking, in-sandbox noise filtering,
  and 85%+ context token compaction with WANDR fact-verification.
---

# Search-as-Code (SaC) Protocol & Agentic Search SDK

## Overview
Search-as-Code (SaC) shifts agent retrieval from monolithic, fixed-pipeline tool calls
to a programmable SDK executing within an isolated sandbox.

Instead of polluting model context with 15,000+ raw tokens across sequential round-trips,
the agent executes a concise retrieval script that:
1. **Fans out** queries in parallel across web, code, memory, and docs.
2. **Filters & Dedupes** records inside the sandbox with custom predicates.
3. **Reranks** candidates with BM25 + Reciprocal Rank Fusion (RRF).
4. **Verifies claims** against evidence with WANDR attribution checks.
5. **Compacts** the resulting facts by **85%+**, slashing context costs and latency.

## CLI Usage

```bash
# Diagnostic health check
sac doctor

# Run an optimized research search with fanout, BM25+RRF reranking, and context compaction
sac search "Perplexity Search as Code architecture" --fanout --rerank --compact

# Execute a custom SaC workflow script (JavaScript or Python)
sac run ./workflow.js
sac run ./workflow.py

# Run the WANDR (Wide ANd Deep Research) Benchmark
sac benchmark
```

## Programmable SDK Primitives

### JavaScript (`sac` in Sandbox)
Inside any SaC script executed by `SaCSandboxRunner` or `sac run ./workflow.js`:

```javascript
// 1. Parallel multi-vector fan-out
const results = await sac.fanout([
  "ByteDance Seed 2.1 Turbo",
  "Seed 2.1 latency and pricing",
  "ByteDance Seed tool calling capability"
], { limit: 5 });

// 2. Semantic & canonical deduplication
const deduped = sac.dedupe(results);

// 3. BM25 + Reciprocal Rank Fusion reranking
const ranked = sac.rerank("ByteDance Seed 2.1 Turbo performance", deduped, { strategy: 'rrf', limit: 5 });

// 4. In-sandbox filtering
const filtered = sac.filter(ranked, (doc) => doc.snippet.length > 30);

// 5. Fact verification & attribution
const verification = sac.verify_claims([
  "ByteDance Seed 2.1 Turbo supports fast tool calling",
  "Context window is 128k"
], filtered);

// 6. Return compact markdown table or verified facts
return sac.synthesize_table(filtered, ['title', 'source', 'snippet']);
```

### Python (`from sac_sdk import sac`)
Inside any Python research script executed via `sac run ./workflow.py`:

```python
from sac_sdk import sac

# 1. Parallel multi-vector fan-out
results = sac.fanout([
    "ByteDance Seed 2.1 Turbo",
    "Seed 2.1 latency and pricing",
    "ByteDance Seed tool calling capability"
], {'limit': 5})

# 2. Deduplicate
deduped = sac.dedupe(results)

# 3. Rerank with BM25 + RRF
ranked = sac.rerank("ByteDance Seed 2.1 Turbo performance", deduped, {'strategy': 'rrf', 'limit': 5})

# 4. Synthesize compact table
table = sac.synthesize_table(ranked, ['title', 'source'])
print(table)
```
