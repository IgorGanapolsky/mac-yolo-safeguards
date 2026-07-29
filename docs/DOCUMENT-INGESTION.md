# Document Ingestion — ratings (2026-07-29)

**Command:** `node tools/document-ingestion-health.js`  
**Offline:** `node tools/document-ingestion-health.js --offline --json`

Overall stack grade (static stages): **B− / B** depending on whether grepae isolated index and lesson FTS are healthy.

---

## Scorecard

| Stage | Grade | Probe focus | One-line judgment |
|-------|-------|-------------|-------------------|
| **Parsing** | **B** | Structure from raw | Born-digital code/text OK; lesson free-text still lossy; academic/media careful |
| **OCR** | **N/A → C** | Visual evidence | Not on primary path; computer-use can OCR locally; lesson `visualEvidence` unused |
| **Deduplication** | **B−** | Hash / lineage | Mechanisms exist; vague recurrence spam still lands as “occurrences” |
| **Normalization** | **B** | Tokens / schemas | Harness dual-tokenization good; domain tags inconsistent |
| **Chunking** | **B+** | Unit of retrieval | Lessons atomic (right); grepae 512/50 OK; harness whole-file is the weak spot |
| **Metadata** | **C+** | Tags / filters | Rich schema, **dirty auto-tags** can promote bad gates — do not hard-filter yet |
| **Incremental updates** | **B / F** | Lag metrics | grepae watch OK when index live; lessons FTS/embed lag is fail |
| **Re-indexing** | **C+** | Rebuild runbook | 0.35 = `watch --background` on isolated clone; dead runbooks fixed in canary |
| **Versioning** | **B+** | Lineage / receipts | Best story (audit hash, revisedFromId, research receipts); weak index↔git SHA bind |

---

## Lanes (not one pipeline)

| Lane | Ingest model | Health instrument |
|------|--------------|-------------------|
| **Code (grepai)** | Embed chunks → gob; watch mtime | `grepai-index-canary.js --live` on `~/.hermes/semantic-index/...` |
| **Lessons (ThumbGate)** | Capture → JSONL + FTS + (fake) embeddings | `thumbgate-lessons-doctor.js` |
| **Harness** | No store — walk + score on demand | `rag-retrieval-eval.js` |
| **Academic** | arXiv/HF metadata → `~/.hermes/research-rag` | Ingest tests; **no agent consumer** |
| **Media** | yt-dlp / subtitles / local STT | Honest skip if tools missing |

---

## Critical failures (fix order)

1. **Lesson store drift** — sqlite 3 / ledger ~450+ → FTS blind.  
2. **Fake embeddings** — hashed TF, empty LanceDB.  
3. **Multi-worktree grepae shell** — REPO `.grepai/index.gob` 384B while isolated clone is healthy (~60MB).  
4. **Academic write-only** — ingest without retrieve in the agent loop.  
5. **Metadata → gates** — auto-entity promotion without human review.

---

## What “improve everything” means next

| Priority | Action | Tradeoff |
|----------|--------|----------|
| P0 | Keep isolated grepae index healthy; canary `--live` from index parent cwd | Ops discipline |
| P0 | Package: rebuild FTS from full ledger + nomic embeddings into LanceDB | Package release |
| P1 | Capture gate: reject vague / question-shaped before promote | Fewer lessons, higher precision |
| P1 | Wire research-rag into one retrieve path or stop calling it RAG | Honesty vs scope |
| P2 | Harness parent-child only if 240KB truncation bites golden cases | Index complexity |

Never claim ingestion is fixed while doctor reports FTS drift or grepae canary fails.
