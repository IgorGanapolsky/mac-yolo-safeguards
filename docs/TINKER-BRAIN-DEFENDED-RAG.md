# Tinker-brain × defended RAG pipeline (A+ / 10/10)

**Commands:**
```bash
python3 tools/tinker-brain/tinker_brain_defended_rag.py          # rank all 8 stages
python3 tools/tinker-brain/tinker_brain_rank.py --suite defended-rag
python3 tools/tinker-brain/tinker_brain_rank.py --suite all      # core + governance + defended-rag
```

Receipt: `~/.hermes/receipts/tinker-brain/defended-rag-rank-latest.json`  
DB: `~/.hermes/receipts/tinker-brain/lessons.sqlite` (FTS5)

---

## Pipeline map (tinker-brain)

```
capture 👎
  → normalize / quality-gate
  → store lesson (SQLite FTS5 + JSONL)
  → retrieve: pragmatic-hybrid (keyword + bigram-Jaccard)
  → multi-query ≤3 variants only when top lexical < 0.6
  → rerank: heuristic cross-encoder (LLM off by default on money path)
  → assemble context
  → gate next answer/tool (deterministic response contract)
```

| Stage | Grade pillar | Implementation |
|------:|--------------|----------------|
| 1 | `capture_thumbs_down` | `capture_down` / `tinker_brain_defended_rag.py capture` |
| 2 | `normalize_quality_gate` | `quality_gate_capture` — vague 👎 not promoted |
| 3 | `store_lesson_sqlite_fts5` | `lessons.sqlite` FTS5 + `lessons.jsonl` |
| 4 | `retrieve_pragmatic_hybrid` | keyword 0.65 + bigram-Jaccard 0.35 over lessons + expert card sections |
| 5 | `multi_query_threshold_0_6` | RRF over ≤3 variants when top &lt; 0.6 |
| 6 | `rerank_cross_encoder` | joint heuristic CE; no LLM default |
| 7 | `assemble_context` | deterministic context block |
| 8 | `gate_next_tool_call_deterministic` | `answer()` + response contract (suppress invent-cash) |

---

## Honest architecture note

Tinker-brain is **not** a general vector RAG product. Cash/GTM answers remain:

`rules router → BM25 expert sections → deterministic ANSWER_CARD → contract`

The defended pipeline adds a **lesson/feedback RAG loop** that feeds research agenda and contextual reminders, then **gates** the next answer with the same fail-closed contract. It does not replace the expert card with free-form generation.

---

## A+ bar

`a_plus=true` only when **every** stage pillar is A+ / 10.0 (mechanical evidence in the receipt).
