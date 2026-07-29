# RAG Quality Program

Established 2026-07-29 after a full-stack retrieval audit. This doc is the
operating contract for retrieval quality across the repo's four retrieval
systems, the measured baselines, and the operator runbook.

## Systems and their status (2026-07-29)

| System | Store | Retrieval | Status |
|---|---|---|---|
| hermes-retrieval-harness | none (live walk) | sparse token scoring | **working, eval-gated in CI** |
| grepai semantic index | local gob | dense (hybrid now enabled) | **DEAD index — canary added; needs Mac-side rebuild** |
| ThumbGate lessons (`.thumbgate/`) | SQLite FTS5 + JSONL | BM25 + hashed-TF cosine | **degraded — doctor added; package-side fixes filed upstream** |
| Graphify code graph | graph.json | lexical + IDF + BFS | working (stale cluster labels) |

## Measured baseline (fixture: tests/fixtures/rag-eval/cases.json)

| Date | Cases | Recall@k | MRR@k | nDCG@k | Notes |
|---|---|---|---|---|---|
| 2026-07-29 (pre) | 7/8 | 0.875 | 0.875 | 0.844 | `empty-stream-hard-stop` case unsatisfiable (no such path in corpus) |
| 2026-07-29 (post) | **8/8** | **1.000** | **0.893** | **0.890** | doc-side dual tokenization + fixture repair |
| 2026-07-29 (path rank) | **8/8** | **1.000** | **0.938** | **0.964** | test-path penalties + query bigram compounds in path (`hardware-leash`, `cloud-failover`); fixed `lessons-feedback` buried under PromoCard/tests |

Changes that produced the delta:
1. **Doc-side dual tokenization** (`tools/hermes-retrieval-harness.js`):
   indexed paths/text emit compound tokens AND camelCase parts
   (`emptyStream` → `emptystream, empty, stream`); queries are NOT expanded.
   Lesson learned in the process: splitting the *query* side flooded rankings
   with every `*-gate` file and regressed recall — asymmetric tokenization is
   the correct design.
2. **Best-window snippets**: snippet now comes from the 3-line window covering
   the most distinct query tokens, not the first token hit (which favored
   import blocks).
3. **Cap visibility**: `retrieve` warns on stderr and reports
   `capReached`/`capNear` when the corpus is at/within 10% of `maxFiles`
   (currently 4,575 files vs the 5,000 default — 9% headroom).
4. **Fixture repair**: replaced the unsatisfiable case with `hardware-leash`
   (real files, distinctive tokens). A fixture that can never pass measures
   staleness, not quality.

## CI gates (all auto-discovered by the `tests/test-*.js` loop)

- `tests/test-rag-retrieval-eval.js` — floors: recall ≥ 0.9, MRR ≥ 0.75,
  nDCG ≥ 0.75, 0 failing cases, ≥ 8 cases. Raise floors as quality improves;
  never lower them to make a change pass.
- `tests/test-grepai-canary.js` — unit-tests the canary on synthetic fixtures
  (deterministic) and prints real index health in warn-only mode in every CI
  log.

## Canaries and doctors (operator-run)

- `node tools/grepai-index-canary.js --live` — fails when the last 15 logged
  searches are all zero-result, when `index.gob` is an empty shell, or when a
  live canary query returns nothing. `com.igor.grepai-index-canary.plist`
  runs it daily at 09:30 (install: `cp com.igor.grepai-index-canary.plist
  ~/Library/LaunchAgents/ && launchctl load ~/Library/LaunchAgents/com.igor.grepai-index-canary.plist`).
- `node tools/thumbgate-lessons-doctor.js` — read-only diagnosis of the
  `.thumbgate` data dir: store drift (ledger vs FTS counts), fake embeddings,
  empty LanceDB, vague captures promoted to rules.

## Operator runbook — finish the ThumbGate hook wiring (Mac-side, one command)

`npx thumbgate init` was run 2026-07-29 from the Cowork sandbox: it installed
the `.claude/commands/thumbgate-*` slash commands into the repo and bumped
`.thumbgate` to 1.30.0, but the PreToolUse hook wires into the *machine that
runs the agent* — so the sandbox got the hook, not the Mac. To gate local
Claude Code sessions, run once on the Mac in this repo:

    npx thumbgate@latest init && npx thumbgate doctor

## Operator runbook — repair the grepai index (Mac-side, ~10 min)

1. `ollama ps` — confirm `nomic-embed-text` is servable.
2. In the indexed checkout (`~/.hermes/semantic-index/mac-yolo-safeguards`
   per docs/LOCAL-SEMANTIC-CODE-INDEX.md): `grepai index --rebuild`.
3. `grepai search "retrieval harness" --json | head` — expect > 0 results.
4. `node tools/grepai-index-canary.js --live` — expect HEALTHY.
5. Hybrid (BM25+dense RRF) was enabled in `.grepai/config.yaml` on
   2026-07-29 and takes effect with this reindex.

## Package-side fixes (belong in github.com/IgorGanapolsky/ThumbGate)

Filed via the ThumbGate MCP `report_product_issue` on 2026-07-29:
1. Lessons FTS store drift — sqlite corpus held 3 of 454+ ledger lessons.
2. `lesson-embeddings.json` is hashed term-frequency, not neural — swap to a
   local embedder (nomic-embed-text via Ollama keeps the local-first promise)
   and populate the already-initialized LanceDB.
3. Capture-quality gate — vague/question-shaped captures are being
   auto-promoted into global `NEVER:` rules (doctor lists current suspects);
   enforce the clarification prompt before promotion eligibility.

## Deliberately deferred (decide with eval data, not taste)

- **Reranking model**: consumer is a PreToolUse hook — per-tool-call latency;
  revisit only if precision@5 is the binding metric after the above land.
- **Query rewriting**: agent-authored queries are already long and specific;
  a static synonym table for recurring failure classes first if ever.
- **Parent-child chunk index for the harness**: trades the harness's
  zero-state virtue for recall; the 240KB `readTextSlice` truncation is the
  trigger to revisit (watch for relevant files > 240KB).
