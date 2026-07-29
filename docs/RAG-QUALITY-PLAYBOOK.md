# RAG Quality Playbook — ThumbGate memory/recall pipeline

Written 2026-07-29 from a live production probe (`recall`, `search_lessons`, `feedback_stats`,
`gate_stats`, on-disk store inspection). Every stage answers three questions: **why does it
exist, what can go wrong, how do we measure whether it's working.** Observed failures are marked
⚠️ OBSERVED with the evidence. Fix list at the bottom.

Ground rule inherited from the engine guardrails: never characterize a stage from what a tool
*couldn't* see. Every claim below traces to a probe output or a file read on 2026-07-29.

---

## 1. Documents / corpus

**Why it exists.** The corpus is the institutional memory: promoted lessons, feedback events,
decision journals, gate events. Without it every agent session starts amnesiac and repeats paid
mistakes.

**What can go wrong.**
- Fragmented stores: lessons split across machine-wide (`~/.thumbgate/projects/default`) and
  per-repo (`<repo>/.thumbgate/`) with no sync — an agent reads one and misses the other.
  ⚠️ OBSERVED: MCP server reads the default store (89 lessons); the repo store holds months of
  logs the server never sees.
- Unbounded append-only growth (9MB decision-journal.jsonl, 2.6MB audit-trail.jsonl) with no
  compaction or retirement policy.
- Silent store corruption. ⚠️ OBSERVED: `lessons.sqlite` is 0 bytes while `lessons-index.jsonl`
  is 311KB — the SQLite path was never populated or failed silently.

**How to measure.**
- Store inventory check in `doctor`: for each store, lesson count, last-write timestamp, and a
  nonzero-size assertion on every declared backend file. Alert on 0-byte DBs.
- Coverage metric: % of capture events reachable from the store the MCP server actually serves.
- Growth dashboard: events/week vs. compacted size; retirement rate of stale lessons.

## 2. Parsing

**Why it exists.** Raw feedback (chat text, CLI args, GPT surface) must become structured
records (signal, context, whatWentWrong, howToAvoid) or nothing downstream can index it.

**What can go wrong.**
- Lossy ingestion: free-text arrives with the actionable half missing.
- Wrong-field mapping (context in whatWentWrong, etc.) breaking downstream display and search.

**How to measure.**
- Field-completeness rate: % of captures with non-null `howToAvoid`/`whatWorked`.
- Round-trip test: capture → search → does the retrieved record contain the sentence you typed?

## 3. Cleaning

**Why it exists.** Garbage lessons don't just waste space — they *rank*. A vague lesson that
matches everything poisons every retrieval.

**What can go wrong.**
- Vague captures accepted at intake. ⚠️ OBSERVED: `prevention-rules.md` "general" bucket:
  **54 recurrences** whose rule text is literally "Investigate and prevent recurrence" —
  a non-rule occupying the highest-weight slot.
- Near-duplicate lessons (same mistake, five phrasings) splitting the recurrence signal.

**How to measure.**
- Intake rejection rate: % of captures bounced for missing concrete corrective action
  (the clarification-prompt path exists — measure how often it fires and whether the
  clarified version lands).
- Dedup rate: canonicalHash collisions merged vs. stored as new.
- "Vagueness lint": flag rules whose text matches a stoplist ("investigate", "be careful",
  "prevent recurrence") with no verb+object.

## 4. Chunking

**Why it exists.** Retrieval units must match answer units. Here the natural unit is one lesson.

**What can go wrong.**
- Multi-incident captures (one paragraph, three lessons) retrieved as an indivisible blob.
- Context windows (2MB conversation-window.jsonl) ingested wholesale would drown lesson signal.

**How to measure.**
- Unit-size distribution (tokens per lesson; flag >500-token lessons for split).
- Answer-containment spot check: for sampled queries, does the top hit contain the answer
  without needing its neighbors?

**Status: healthy.** Lesson-sized units are the right call; nothing observed broken here.

## 5. Metadata extraction

**Why it exists.** Tags, domain, entities, importance, and Bayesian stats let retrieval filter
and rerank beyond raw text, and let gates scope to the right context.

**What can go wrong.**
- Auto-entity misfires that then drive enforcement. ⚠️ OBSERVED: content-engine feedback about
  duplicate LinkedIn comments auto-tagged `entity:Customer` (no customer involved), and an
  auto-promoted **block** gate exists with the bare pattern `entity:Customer` (4 occurrences) —
  an over-broad gate born from mis-extracted metadata.
- Domain misclassification (⚠️ OBSERVED: a Claude-Desktop MCP install lesson classified
  `domain: "testing"`).

**How to measure.**
- Entity precision audit: sample N auto-entities/week, human-judge correctness; track precision.
- Gate-pattern review: any auto-promoted gate whose pattern is a single generic tag/entity gets
  flagged for human review before it can `block` (warn-only until approved).
- Domain confusion matrix on a labeled sample.

## 6. Embeddings

**Why it exists.** Lexical match can't find "the same mistake in different words" — semantic
similarity is what makes a lesson from Cursor block a repeat in Claude Code phrased differently.

**What can go wrong.**
- The embedding pipeline silently not running, degrading to lexical without telling anyone.
  ⚠️ OBSERVED (P0): `search_lessons` returns `"backend":"jsonl-jaccard"` — production retrieval
  is token-overlap, not bge-small/LanceDB as documented. The README's semantic claim does not
  hold in this install.
- Model/version drift between index-time and query-time embeddings.

**How to measure.**
- `doctor` must assert which backend is active and FAIL (not warn) when the configured backend
  ≠ the serving backend.
- Paraphrase eval: a held-out set of (query, relevant-lesson) pairs where the query shares no
  tokens with the lesson. Jaccard scores ~0 on these by construction; the semantic backend must
  clear a threshold. Run in CI.

## 7. Vector database

**Why it exists.** Stores embeddings for ANN search at corpus sizes where brute force stops
being free, with filtering by metadata.

**What can go wrong.**
- Index never built / not found → silent fallback (same P0 as above).
- Index-store divergence: lessons added to JSONL but never embedded, so newest lessons are
  invisible to semantic search precisely when they're most relevant.

**How to measure.**
- Index-lag metric: count(lessons) − count(vectors), alert when > 0 for more than a few minutes.
- Recall@k parity test between brute-force cosine and ANN on a sample (catches broken indexes).

## 8. Retrieval

**Why it exists.** The one stage users feel directly: given "what's about to go wrong," return
the lessons that stop it.

**What can go wrong.**
- Cross-domain bleed from a shared store. ⚠️ OBSERVED: query "duplicate comment concurrency
  browser" → #1 exactly right (4/4 tokens, 0.87 reranked), but #2–3 were mobile-app lessons
  matching only "duplicate" (scores 0.11/0.16).
- Empty-result queries misread as "no prior lesson" when it's actually an indexing gap.

**How to measure.**
- Precision@1 / Precision@3 on a growing golden-query set (add one golden pair per incident).
- Score-floor discipline: report items below a relevance floor as "weak matches," not peers of
  the top hit — measure how often weak matches get injected into context packs.
- Track recall-before-failure: % of gate blocks/incidents where a relevant lesson existed and
  was retrieved *before* the action (the whole point of the product).

## 9. Reranking

**Why it exists.** First-pass retrieval optimizes recall; reranking restores precision using
richer signals (entities, recency/decay, importance, Bayesian confidence).

**What can go wrong.**
- Dead reranking channels. ⚠️ OBSERVED: `entityScore: 0` on every result — the entity channel
  contributes nothing, so "hybrid" reranking is currently lexical re-weighting.
- Recency decay burying a rare-but-critical old lesson (mitigated by the "sticky" high-risk
  state — good design, keep it).

**How to measure.**
- Channel ablation: log per-channel score contributions; a channel at 0 across a week is dead
  and should alert.
- Rank-delta metric: how often reranking changes the #1 vs. first-pass (0% = reranker inert;
  very high % = first pass is broken).

## 10. Prompt assembly (context packs)

**Why it exists.** Retrieval is useless if the agent's context gets a dump instead of a
budgeted, rationale-carrying pack.

**What can go wrong.**
- Pack bloat crowding out task context; irrelevant items entering packs (⚠️ OBSERVED once:
  an EAS/iPad OTA lesson in a pack about browser concurrency).
- Missing provenance, so the agent can't cite which lesson drove a decision.

**How to measure.**
- Pack utilization: did the agent's subsequent behavior reference a pack item (track via
  `track_action`/receipts)? Injected-but-ignored rate is the key waste metric.
- Token budget adherence per pack; items-per-pack distribution.

**Status: strongest stage.** Compact packs with per-item rationale and scores. Keep.

## 11. LLM usage

**Why it exists.** Deliberately *absent* from the enforcement path (deterministic gates — the
product's core promise). Legitimately present in optional distillation/diagnosis of captures.

**What can go wrong.**
- Scope creep: an LLM sneaking into the gate decision path would break the "0 LLM in
  enforcement" claim — treat as a regression, not a feature.
- Distillation silently off. ⚠️ OBSERVED: `distillation: null`, `diagnosis: null` on every
  event captured today — the enrichment layer isn't running in this install.

**How to measure.**
- CI assertion that the gate decision path imports no LLM client.
- Distillation coverage: % of captures with non-null distillation; alert on 0% weeks.

## 12. Structured output

**Why it exists.** Machine-readable records with lifecycle state are what make the loop
enforceable (capture → lesson → rule → gate) instead of prose.

**What can go wrong.**
- Aggregation bugs reporting confident zeros. ⚠️ OBSERVED (P0): `feedback_stats` returns
  `total: 0` for every window while `rawTotal: 89, excludedTotal: 89` — the stats layer
  excludes every event it counts, so dashboards would show a dead system that is actually
  learning. A zero that isn't a zero is the exact "instrument couldn't see it" failure class.
- Unbounded payloads. ⚠️ OBSERVED: `gate_stats` returned ~92KB unpaginated — hostile to LLM
  consumers with context budgets.

**How to measure.**
- Invariant test in CI: `sum(window totals) + excluded == rawTotal` AND `excluded < rawTotal`
  on any store with recent activity.
- Payload-size budget per MCP tool response; paginate past it.

---

## Fix list (ordered)

| # | Fix | Stage | Status |
|---|---|---|---|
| P0-1 | Retrieval serving `jsonl-jaccard` instead of documented semantic backend; `lessons.sqlite` 0 bytes. Make `doctor` fail loudly on backend mismatch; build/repair the index. | 6/7 | Filed upstream |
| P0-2 | `feedback_stats` excludes 100% of events (`total:0`, `rawTotal:89`). Fix window/scope filter + add CI invariant. | 12 | Filed upstream |
| P0-3 | Capture intake accepts vague lessons ("Investigate and prevent recurrence" ×54). Reject captures without concrete verb+object corrective action; backfill-lint the general bucket. | 3 | Filed upstream |
| P1-4 | Auto-promoted `block` gate from bare `entity:Customer` (mis-extracted entity). Single-tag patterns cap at `warn` until human-approved. | 5 | Filed upstream |
| P1-5 | `init` writes machine-absolute paths into shared `.mcp.json` (breaks other machines/CI). Emit portable `npx -y thumbgate serve`. | install | Filed upstream; local `.mcp.json` already hand-fixed 2026-07-29 |
| P1-6 | Claude Desktop `.mcpb` extension crashes at launch ("Server disconnected"); config-based `sh -lc npx` workaround works. Fix bundle or document the workaround. | install | Filed upstream; workaround live on operator's machine |
| P2-7 | `gate_stats` unpaginated 92KB payloads; `distillation` never populated; store fragmentation (default vs repo scope). | 1/11/12 | Filed upstream |

**Local mitigations already in place (this repo):** content-engine skill v5.1 enforces
concrete-capture discipline, run-locks, and recall-at-start; `.mcp.json` portable entry fixed;
canonical-handle table prevents identity guessing.

---

# Ingestion audit addendum (2026-07-29, same probe)

| Stage | Grade | Evidence | Fix |
|---|---|---|---|
| Parsing | B+ | Structured capture schema at source (signal/context/whatWentWrong/howToAvoid/tags); typed-prefix convention on the GPT surface | Keep; add rejection feedback loop when fields missing |
| OCR | N/A | Corpus is born-digital; `visualEvidence` field exists but null on every observed record — no image path exercised | If screenshots become evidence, they need an extraction path or they're dead weight in the schema |
| Deduplication | B− | `canonicalHash`, `occurrences`, and live `revisedFromId` lineage all observed firing (each related capture revised its predecessor). BUT 54 identical vague rules accumulated as "recurrences" instead of being merged/rejected; import dedup is ID/title+signal only, so paraphrase dupes pass | Content-level near-dup check at intake (cheap at this corpus size: cosine vs existing lessons once the vector path works) |
| Normalization | C | Free-form tags (no controlled vocabulary); domain classifier misfires observed twice (`testing` on an MCP-install lesson, `general` on a RAG audit); entity normalization noisy (`entity:Customer` misfire); no alias table (force-push variants) | Controlled tag vocabulary with alias map; human-confirm entities that feed gates |
| Chunking | B+ | Lesson-sized units; only gap is multi-incident captures entering as one blob | Split at intake with one clarification prompt |
| Metadata | B− | Rich (Bayesian stats, lifecycle, decay, importance) but precision issues drive enforcement errors — see main §5 | Precision before richness |
| Incremental updates | B / F split | Lexical path: immediate — a capture was retrievable seconds later as top hit; `.watcher-offset` shows watcher-based log ingest. Semantic path: no incremental embedding exists at all (index absent, P0-1) | Fix vector path, then embed-on-capture with an index-lag metric |
| Re-indexing | D | No rebuild/repair command in the CLI reference; the 0-byte `lessons.sqlite` sat broken with no alert; **`doctor` ran clean past it** (flagged only runtime isolation) | `thumbgate reindex` command; doctor asserts nonzero index + backend match (same fix as P0-1) |
| Versioning | B+ | Strongest ingestion story: hash-chained audit log, observed `revisedFromId` lineage, `canonicalHash`, gates carry `promotedAt` + rule version, deterministic git-versioned BRAIN.md | Add a schema-version field to JSONL records before the first breaking migration forces it |

**Overall ingestion: C+.** Good bones — schema, lineage, immediacy — undermined by silent index
rot with no repair path and weak normalization. The theme across both audits is identical:
every failure is a component reporting fine while doing nothing (0-byte index, zeroed stats,
doctor passing over both). The fix pattern is always the same: make the health check assert the
thing, not the wrapper.
