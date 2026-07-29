# Tinker-brain document ingestion and retrieval

`tools/tinker-brain/tinker_brain_ingestion.py` is the local-first ingestion,
indexing, and retrieval engine for Tinker-brain evidence. It is intentionally a
separate subsystem from deterministic answer routing: ingestion can fail or be
rolled back without changing the answer contract.

The release gate is:

```bash
python3 tests/test-tinker-brain-ingestion.py
python3 tests/test-tinker-brain-simulation.py
python3 tools/tinker-brain/tinker_brain_ingestion.py eval
python3 tools/tinker-brain/tinker_brain_simulation.py --seeds 12 --steps 24
```

The checked-in fixture has eight satisfiable queries across exact, paraphrase,
ingestion, operations, tool-safety, product, and claims slices. CI fails below
eight queries, Recall@5 0.90, MRR 0.80, or nDCG@5 0.80. The fixture is a
regression gate, not proof of production relevance. Every query must also
retain Recall@5 1.00, MRR 0.50, and nDCG@5 0.60; fixture validation rejects
qrels that name a nonexistent source. Add a query and qrels for every observed
retrieval miss. The deterministic fixture also records p50/p95/p99 latency and
fails if p95 exceeds 500 ms; this is a regression budget for the tiny fixture,
not a production SLO.

## Stage contracts

| Stage | Why it exists | What can go wrong | Measurements and release proof |
|---|---|---|---|
| Parsing | Convert supported inputs into inspectable text instead of treating arbitrary bytes as text. | Unsupported MIME accepted; invalid UTF-8 silently changed; HTML script/style leakage; empty extraction. | Parse-success, unsupported-MIME, and empty-extract counts. Tests prove fail-closed MIME behavior, JSON/JSONL canonicalization, HTML sanitization, and UTF-8 errors. |
| OCR | Recover text from a scanned PDF or image only when native extraction is insufficient. | Expensive OCR on text PDFs; missing local binaries; OCR garbage treated as authoritative. | OCR fallback/failure counts, extracted character count, and `ocr_used`/`ocr_engine` metadata. A fake command runner proves native PDF extraction precedes `pdftoppm` + Tesseract. |
| Normalization | Give semantically identical Unicode and structured data the same content identity while retaining the raw evidence. | Non-idempotent cleanup; NFC variants diverge; raw text overwritten; excessive whitespace rewriting changes meaning. | Raw and normalized SHA-256 hashes plus an idempotence test. NFC, BOM/line-ending cleanup, canonical JSON/JSONL, and conservative whitespace normalization are versioned. |
| Deduplication | Stop identical evidence from crowding ranking without discarding its source provenance. | Duplicate chunks dominate top-k; distinct revisions collapse; alternate source URIs disappear. | Exact-duplicate count, canonical-document count, and source-alias count. Dedup is exact normalized-hash only; near-duplicate removal is deliberately excluded because false merges are harder to detect than extra evidence. |
| Chunking | Rank focused evidence while returning the correct parent context. | Ordinal IDs shift after an insertion; an answer is split across chunks; overlap or repeated JSONL rows consume top-k. | Chunk count, stable-ID tests, unique-parent result count, and parent-context rate. Markdown headings define parents; long sections use bounded overlapping windows; ThumbGate JSONL lessons remain record-atomic and exact duplicate rows are suppressed. IDs bind logical document, heading/record ID, and content—not ordinal position. |
| Metadata | Preserve provenance and permit scoped retrieval and reproducibility. | Inferred tags are treated as source facts; bad metadata silently removes the correct answer; component versions go missing; a fallback crosses an authorization boundary. | Metadata/version fill rate and filter-fallback rate. Metadata includes source URI, MIME, language, byte/mtime data, raw and normalized hashes, parser/normalizer/chunker/embedding versions, OCR state, offsets, and user fields. Filters are strict and applied before both rankings by default; widening requires explicit `--filter-fallback` and is visible in the response. |
| Incremental updates | Avoid reprocessing unchanged sources and make deletions explicit. | Every scan re-ingests; changed content is missed; deleted content remains searchable. | Added/changed/unchanged/deleted counters and tombstone state. `sync` compares source heads by normalized content hash, creates immutable document versions, and tombstones deleted heads. |
| Re-indexing | Rebuild changed chunks or embeddings without replacing a healthy index with a partial one. | Half-built index becomes active; previous generation is deleted too early; stale vectors survive a model change. | Generation status, active pointer, chunk count, and a failed-rebuild invariant. Reindex builds a shadow generation inside a transaction, validates it, and switches one active pointer only on success. The test injects a mid-build failure and proves the prior generation still answers. |
| Versioning | Reproduce and roll back the exact evidence and retrieval implementation. | Missing lineage; unversioned parser/model change; rollback points at an incomplete generation. | Immutable document-version count, generation lineage, component-version fill, and rollback tests. Ready generations remain available for explicit rollback. |

The same stage contracts are emitted by `status` as JSON so an operator or
dashboard does not need to infer purpose, failures, or metrics from prose.

## Retrieval design and tradeoffs

Retrieval uses SQLite FTS5/BM25 plus local embeddings, weighted reciprocal-rank
fusion, a bounded deterministic reranker, metadata filters, and parent-child
return.

- **Hybrid BM25 + vector:** BM25 protects exact identifiers, provider names,
  errors, and paths; vectors recover paraphrases. Lexical ranks receive a
  modest 2:1 fusion weight because operational exact matches are stronger
  evidence than a vague semantic collision. The cost is two rankings and
  fusion tuning, measured by the fixed qrels rather than intuition.
- **Local embeddings:** the deterministic CI default is a versioned signed
  token/bigram hashing vector. `--embedding-model auto` uses local
  `nomic-embed-text` through Ollama when available; the request keeps the model
  warm and permits a bounded 60-second cold start. An explicit
  `ollama:<model>` fails closed if unavailable. Local vectors avoid sending
  terminal or evidence text to a cloud provider. The hash model is less
  semantic than a neural model, so the model name is stored on every
  generation and the eval must be rerun before switching.
- **Query rewriting:** expansion is a small deterministic synonym map for
  observed vocabulary gaps. It adds no model latency and is inspectable in
  every search response. It will not generalize like an LLM rewrite, so misses
  should extend the fixture and only then justify new expansion terms.
- **Metadata filtering:** exact pre-filtering protects recall for a rare scoped
  document because BM25 and vector ranking see the same narrowed candidate
  set. Dirty metadata can hide the only relevant result, but automatic
  widening can leak across a tenant or authorization boundary. Search is
  therefore strict by default; heuristic callers may opt into a visible
  fallback (`filter_fallback: true`).
- **Reranking:** overlap, exact phrase, vector similarity, and RRF rerank only a
  bounded candidate set. This avoids a model call on every tool use, at the
  cost of weaker deep semantic judgments. Each result returns the individual
  lexical RRF, vector RRF, vector similarity, overlap, and boost values so a
  bad rank can be diagnosed rather than guessed at.
- **Parent-child retrieval:** chunks are ranked, but only one best chunk per
  logical document consumes a result slot and the full normalized parent is
  returned. JSONL lesson rows are already atomic, so the row—not the entire
  lesson-store file—is the returned parent. This prevents one multi-section
  file from crowding out other relevant documents. The tradeoff for ordinary
  documents is a larger response payload.

Every search binds all reads to one immutable active generation and reports
`consistency: strong_generation_snapshot`. It also reports filter, lexical,
vector, fusion/rerank, hydration, and total latency. This makes warm/cold or
ranking-stage regressions measurable without importing a hosted database.

## Turbopuffer ideas: adopted versus rejected

The [Turbopuffer/Pragmatic page](https://turbopuffer.com/pragmatic) describes
vector plus full-text search on object storage with an intelligent cache and
shows a large warm/cold latency gap for a 10-million-document workload.
[Turbopuffer's query documentation](https://turbopuffer.com/docs/query.md)
adds three ideas that transfer at our scale: hybrid subqueries should observe
one consistent snapshot, filters should be recall-aware, and component scores
should be available as reranker/debugging features.

This engine adopts the transferable invariants:

1. immutable-generation snapshot consistency;
2. metadata filtering before both lexical and vector candidate selection;
3. explainable component scores;
4. p50/p95/p99 latency in the relevance eval;
5. exact brute-force vector ranking over the filtered subset.

It does **not** adopt object storage, ANN, cache warming, hosted embeddings, or
namespace sharding. At hundreds or low thousands of local documents, SQLite
FTS5 plus exact vector scoring is simpler, deterministic, private, and fast.
Object storage would add a cold-cache path and operational dependency without
reducing the current bottleneck. Revisit ANN/object storage only when measured
corpus size or p95 latency crosses a documented budget.

## Antithesis ideas: deterministic state exploration

[Antithesis describes deterministic simulation testing](https://antithesis.com/docs/resources/deterministic_simulation_testing/)
as controlling nondeterministic inputs, exploring many seeded histories,
injecting faults, and checking invariants so a failure can be replayed.
[Its fault-injection documentation](https://antithesis.com/docs/concepts/fault_injection/)
also distinguishes disruption from a recovery/quiet period, when final
properties should be checked.

`tinker_brain_simulation.py` adopts the part we can own without a custom
hypervisor:

- a local seeded state machine explores upsert, delete, exact duplicate,
  successful reindex, search, metadata-filter isolation, and rollback;
- deterministic faults exercise unsupported parsing, partial reindex,
  embedding failure, and validator rejection;
- invariants run after every transition: exactly one active generation, no
  failed generation has chunks or FTS rows, active source heads point to
  current non-tombstoned documents, searches stay on one snapshot, and strict
  metadata filters cannot cross domains or tenants;
- every seed is run twice and compared by semantic state/trace digest, with
  wall-clock IDs and latency excluded from equivalence;
- an invariant failure records the seed, replay command, full trace, and a
  delta-debugged minimal trace.

This caught a harness bug on its first run: 6 of 12 replays diverged because
rollback candidates were sorted by second-resolution timestamps plus random
generation IDs. The runner now preserves successful-build order; the same
12 seeds and 288 transitions replay with zero mismatches.

We do **not** claim Antithesis-equivalent determinism. SQLite, Python, the OS,
and Ollama are not running under a deterministic hypervisor, so thread,
filesystem, clock, network, and GPU schedules remain outside our control. The
local harness is still valuable because it makes our operation generator,
fault schedule, expected invariants, and semantic replay deterministic. A
hosted DST environment becomes worthwhile when multi-process connector,
control-plane, and mobile workflows can be containerized with explicit
cross-service invariants.

### Decision KPIs and playbooks

The simulation receipt turns its measurements into actions:

| KPI | Question | Threshold | If red |
|---|---|---:|---|
| Invariant failures | Did any history violate a safety or liveness promise? | 0 | Block merge, replay the seed, fix the minimal trace, and retain it as a regression. |
| Replay mismatches | Does one seed reproduce one semantic history? | 0 | Remove uncontrolled time, randomness, ordering, or external I/O. |
| State-transition coverage | Did CI execute every supported operation class? | 100% | Add or reweight the missing operation. |
| Fault coverage | Did CI actually trigger every declared failure class? | 100% | Add a deterministic injection point and preservation invariant. |
| Runtime | Is this cheap enough for every PR? | <=5 seconds for 12x24 | Keep a small PR seed set and move additional breadth to scheduled CI. |

These are harness-quality KPIs, not product/revenue outcomes. The weekly review
should add one new seed or invariant for every real incident, and should not
raise seed count merely to make a dashboard look busier.

## Operations

Use a dedicated database; the default is
`~/.hermes/tinker-brain/ingestion.sqlite3`.

```bash
# Add explicit documents, then build an atomic generation.
python3 tools/tinker-brain/tinker_brain_ingestion.py ingest docs/example.md
python3 tools/tinker-brain/tinker_brain_ingestion.py reindex

# Prefer the installed local neural model when Ollama is healthy. `auto`
# records the actual selected model on the generation and fails the shadow
# build without changing the active pointer if embedding stalls.
python3 tools/tinker-brain/tinker_brain_ingestion.py \
  --embedding-model auto reindex

# Incrementally reconcile a directory, including tombstoning deletions.
python3 tools/tinker-brain/tinker_brain_ingestion.py sync docs/
python3 tools/tinker-brain/tinker_brain_ingestion.py reindex

# Search and inspect provenance, parent context, filters, and model version.
python3 tools/tinker-brain/tinker_brain_ingestion.py search \
  "why is external revenue zero?" --limit 5 --filter domain=revenue
# Heuristic-only callers may explicitly widen a bad metadata filter:
python3 tools/tinker-brain/tinker_brain_ingestion.py search \
  "why is external revenue zero?" --filter domain=revenue --filter-fallback
python3 tools/tinker-brain/tinker_brain_ingestion.py status

# Roll back to a ready generation shown by status.
python3 tools/tinker-brain/tinker_brain_ingestion.py rollback <generation-id>
```

`eval` intentionally creates an isolated temporary database. It does not alter
the operational index. Reindexing an empty corpus is allowed and produces an
empty active generation only when no previous documents exist; a non-empty
corpus producing zero chunks fails closed.

## Integration boundary

This engine owns evidence ingestion and retrieval. The existing
`tinker_brain_answer.py`, router, answer contract, revenue snapshot, and golden
answer eval remain separately versioned. During this implementation those
files were already owned by active PRs, so this change does not silently alter
deterministic production answers. Wiring retrieved evidence into answer
generation must be a separate, claimed change with answer-contract and
end-to-end fixture proof after those owners release the files.
