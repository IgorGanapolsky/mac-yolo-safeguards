# Hermes academic research RAG

This lane turns current public research metadata into a small, cited evidence queue
that Hermes can actually retrieve. It exists to answer architecture and evaluation
questions from primary-source metadata without turning the public internet into
executable agent instructions.

## Daily flow

1. At 9:17 AM local time, the LaunchAgent independently requests at most ten recent
   results from the arXiv API and ten public model records from the Hugging Face
   Hub API. One failed source does not discard the other source's records.
2. The tool normalizes source IDs, URLs, dates, authors, tags, license metadata,
   download/like counters, and a SHA-256 content digest.
3. It deduplicates against the private local corpus by source ID and digest.
4. It deterministically scores relevance, recency, community signal, novelty, and
   actionability. Missing license metadata and derived/quantized artifacts receive
   explicit risk penalties. Citation count is `0` when the source API does not
   provide it; community signals are never mislabeled as citations.
5. The top five records become experiment proposals. A proposal requires a primary
   source read, a bounded local benchmark, cost/license review, and independent
   regression proof before any adoption decision.

Private receipts live in `~/.hermes/research-rag` with directory mode `0700` and
file mode `0600`. Schema v3 `latest.json` is the single authoritative snapshot:
it commits the receipt, source statuses, full deduplicated corpus, generation ID,
and corpus hash in one same-directory `fsync` plus atomic rename. `corpus.jsonl`
and the dated JSON file are compatibility exports, not commit truth; an export
failure cannot make the default consumer read a half-committed generation. Raw
passwords and tokens are not written there.

Receipts expose `status=complete|partial|failed` and a status, timestamp, item
count, URL, and bounded error for each source:

- `complete`: both sources settled successfully. A same-day scheduled invocation
  may reuse this receipt.
- `partial`: successful records are retained and searchable, the CLI exits `2`,
  and the same day remains retryable.
- `failed`: neither source produced data. `latest.json` and `corpus.jsonl` remain
  byte-for-byte last-good; a separate private receipt is written under
  `attempts/`, and the CLI exits `1`.

## Retrieval consumer

`hermes-academic-research-search.js` is the production consumer for this corpus.
It scans the small local ledger, applies deterministic query expansion plus
field-weighted lexical ranking, and returns provenance with every hit: source ID,
URL, dates, license, tags, and content hash.

```sh
node tools/hermes-academic-research-search.js \
  --query "retrieval canary evaluation" \
  --max-age-days 90 \
  --json
```

Optional pre-ranking filters are `--source`, `--tag`, `--license`, and
`--max-age-days`. A known-answer operational probe uses `--canary-id ID` and exits
nonzero when the expected record is absent. The default reads the atomic
`latest.json` snapshot; `--corpus PATH` exists only for explicit legacy exports
and test fixtures.

This lane deliberately does not maintain a second vector database for roughly
dozens of atomic metadata records. The tradeoff is weaker paraphrase recall than a
dense retriever; the benefit is zero embedding spend, no sensitive-data egress,
sub-millisecond local scoring at this scale, and no additional stale-index state.
The checked-in 12-query eval and real retrieval misses determine when that tradeoff
stops being acceptable.

## Failure model and measurements

| Stage | Why it exists | What can go wrong | Working signal |
|---|---|---|---|
| Parse | Convert Atom/Hub responses into one schema | malformed XML/JSON, missing identity or dates | parser fixtures retain IDs, URLs, authors, tags, license, and hashes |
| Normalize/dedupe | Make updates comparable | unstable IDs or duplicate content | stable source ID plus SHA-256; repeated digest emits no proposal |
| Persist/update | Preserve last-good evidence | one source outage, truncated write, cross-file split-brain, stale daily receipt | one schema-v3 atomic snapshot; source statuses; partial retries; injected commit failure leaves old bytes; failed compatibility export cannot invalidate the committed generation; total outage creates only an attempt receipt |
| Retrieve/filter | Answer bounded research questions | vocabulary mismatch, metadata leakage, stale results | 12 qrels: Recall@5 >= 0.95, MRR@10 >= 0.90, nDCG@10 >= 0.90; source/license/tag/freshness controls |
| Operate | Detect a corpus that exists but cannot answer | empty/corrupt corpus or missing known record | search CLI exits nonzero for parse errors and failed `--canary-id` |

## Hard boundaries

- Two metadata requests per day; 2 MiB response ceiling; 12-second request timeout.
- Exact host allowlist: `export.arxiv.org`, `huggingface.co`.
- No model, dataset, Space, pickle, safetensors, or repository download.
- No `trust_remote_code`, dynamic import, `eval`, notebook execution, shell command,
  production routing change, deployment, publishing, training, or paid inference.
- A repeated source digest emits no proposals.
- The evidence pack is source-balanced. A Hugging Face model is not proposed for
  evaluation when its license metadata is missing or its metadata flags a derived
  or quantized artifact; popularity never cancels those gates.
- Public Hugging Face metadata works without a credential. Private or gated assets
  require a separate least-privilege Hub token; a website password is never used as
  an API token.

## Verification

```sh
node tests/test-hermes-academic-research-ingest.js
node tests/test-hermes-academic-research-search.js
node tools/hermes-academic-research-ingest.js --help
node tools/hermes-academic-research-search.js --help
```

The eval uses the correct ideal ranking from all qrels, not only retrieved
documents. Its negative control removes two relevant records and must drive
Recall@5 below the release floor. These tests prove ingestion and deterministic
retrieval behavior; they do not prove that any paper or model improves Hermes.
Only an isolated benchmark followed by existing ship gates can establish that.
