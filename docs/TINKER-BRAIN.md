# tinker-brain — the ThumbGate.app GTM revenue brain

`tinker-brain` (CLI at `~/.local/bin/tinker-brain`) is a fail-closed, **card-grounded**
answer system whose job is to be the resident expert on **selling ThumbGate.app**:
positioning, pricing, marketing/promotion, sales motion, legal/brand stance, and
honest cash truth. Home is `tools/tinker-brain/` in this repo.

## Stack (honest — not classic vector RAG)

| Layer | Implementation | Grade target |
|-------|----------------|--------------|
| **Store** | `ANSWER_CARD.txt` + `THUMBGATE_EXPERT_CARD.txt` under `~/.hermes/business-brain/data-snapshot/`; live export from thumbgate.app health/billing + receipts | A+ purpose-fit (not a Vector DB) |
| **Embeddings / Vector DB** | **None** on the money path by design | A+ intentional absence |
| **Retrieval** | In-card **BM25-lite + intent priors** (`tinker_brain_section_retrieve.py`) over expert sections | A+ section ranker |
| **Orchestration** | export → rules router (+confidence) → section retrieve → deterministic answer → response contract → coverage → receipts | A+ |
| **Optional model** | Ollama `qwen3-hermes-tinker-toolfix:q4` paraphrase-only when `TINKER_BRAIN_USE_OLLAMA=1` | A+ demoted path |

There is **no** Pinecone/Qdrant/Chroma/FAISS collection. Cash numbers never come from weights.

## How an answer happens

1. **Export** — `export_tinker_brain_snapshot.py` refreshes the atomic snapshot
   (live health + billing, optional Stripe/AEO receipts) into `ANSWER_CARD.txt` and
   **byte-copies** `config/THUMBGATE_EXPERT_CARD.txt` into the snapshot dir.
2. **Route** — `tinker_brain_router.py`, rules only (no LLM). Emits `primary`,
   multi-label `flags`, and deterministic `confidence`. Legal/brand questions set
   `wants_legal_brand` and still land on `thumbgate_gtm`.
3. **Retrieve** — `tinker_brain_section_retrieve.py` ranks expert-card sections
   (BM25-lite + flag priors); hard-includes for pricing/channels/LEGAL_BRAND.
4. **Answer** — `tinker_brain_answer.py` renders selected sections + cash rails.
   Default mode is `deterministic_card` (zero model spend).
5. **Validate** — `tinker_response_contract.py` fail-closed. Channel bans are
   **propose-as-channel** only (competitor "GitHub stars" citations are allowed;
   "Make GitHub the top conversion channel" is not).
6. **Coverage** — `tinker_brain_coverage.py` banners + logs gaps when the card did
   not address the question's terms (exit 3).
7. **Health / heal** — `tinker_brain_health.py` detects snapshot/repo divergence and
   card staleness; `--heal` re-exports.
8. **Scorecard** — `tinker_brain_scorecard.py` fails closed unless every pillar is A+.

## Commands

```bash
python3 tools/tinker-brain/export_tinker_brain_snapshot.py
python3 tools/tinker-brain/tinker_brain_health.py --heal
python3 tools/tinker-brain/tinker_brain_eval.py
python3 tools/tinker-brain/tinker_brain_scorecard.py --heal-first
python3 tests/test-tinker-brain.py
```

Eval: expanded golden set (≥48 cases = E2E + contract). Receipts:
`~/.hermes/receipts/tinker-brain/`.

## Updating expertise

Edit `config/THUMBGATE_EXPERT_CARD.txt`, re-export (or `health --heal`), re-run eval +
scorecard, add a golden case for whatever changed. Prices always from live billing.
