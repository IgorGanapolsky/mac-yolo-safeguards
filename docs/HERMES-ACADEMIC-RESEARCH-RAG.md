# Hermes academic research RAG

This lane turns current public research metadata into a small, cited evidence queue.
It does not turn the public internet into executable agent instructions.

## Daily flow

1. At 9:17 AM local time, the LaunchAgent requests at most ten recent results from
   the arXiv API and ten public model records from the Hugging Face Hub API.
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
file mode `0600`. `latest.json` is the bounded retrieval pack; `corpus.jsonl` is the
dedupe ledger. Raw passwords and tokens are not written there.

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
node tools/hermes-academic-research-ingest.js --help
zsh scripts/install-hermes-academic-research-agent.sh
launchctl print gui/$(id -u)/com.igor.hermes-academic-research-agent
```

The first live run is discovery evidence only. It does not prove that any paper or
model improves Hermes. Only an isolated benchmark followed by existing ship gates
can establish that.
