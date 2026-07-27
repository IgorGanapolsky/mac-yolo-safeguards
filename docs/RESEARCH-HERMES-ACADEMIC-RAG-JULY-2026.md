# Hermes academic research ingestion decision — July 2026

## Decision

Implement a zero-dollar, metadata-first discovery loop. Use arXiv as the primary
paper source and public Hugging Face Hub model metadata as a secondary ecosystem
signal. Keep OpenAlex optional because its July 2026 API requires a free key, and
do not scrape Google Scholar.

The valuable system change is not “more documents.” It is a repeatable evidence
contract: stable source IDs, immutable content hashes, dated provenance, explicit
missing fields, deterministic ranking, bounded retrieval, and proposal-only output.

## Primary-source receipt

Checked 2026-07-22 UTC:

- arXiv documents an Atom API with fielded queries and result limits:
  https://info.arxiv.org/help/api/user-manual.html
- Hugging Face documents the Hub API and separately publishes rate-limit behavior:
  https://huggingface.co/docs/hub/api
  https://huggingface.co/docs/hub/en/rate-limits
- OpenAlex documents API authentication and a `$1/day` free usage allowance:
  https://docs.openalex.org/how-to-use-the-api/rate-limits-and-authentication

## DS / ML ranking

The first version is intentionally interpretable:

`0.40 relevance + 0.20 recency + 0.15 community + 0.15 novelty + 0.10 actionability - risk penalties`

Citation count remains zero unless a source explicitly supplies it. Model downloads
and likes are a separate community signal, not scientific validation. After at least
30 reviewed proposals, the ledger can support offline calibration against accept /
reject labels. Until then, a learned ranker would be premature.

The result pack is source-balanced so a burst of freshly uploaded derivatives cannot
crowd out papers. Missing license metadata costs `0.20`; derived or quantized model
metadata costs `0.10`; either condition blocks automatic proposal generation.

## Rejected scope

- Google Scholar scraping or browser automation.
- Vector database, Spark, Databricks, or Snowflake for a few dozen daily records.
- Automated model downloads, fine-tuning, routing changes, or code generation from
  untrusted papers/model cards.
- Paid inference, crawler subscriptions, and unattended self-modification.

These can be reconsidered only when corpus size, retrieval latency, or measured eval
quality shows the local JSONL evidence pack is the bottleneck.
