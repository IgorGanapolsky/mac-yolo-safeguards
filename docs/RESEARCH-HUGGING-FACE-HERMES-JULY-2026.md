# Hugging Face for Hermes and ThumbGate — July 2026

Deep-research run: `trun_fc3268d892f541d68c1ee5706c429acc`

Checked: 2026-07-22 UTC

## Decision

Use Hugging Face as a read-only model-metadata signal inside the daily academic
research queue. Do not make Hugging Face a production runtime, model host, user
identity provider, vector database, or transcript store.

This is the highest-ROI choice under the `$10/month` operating ceiling because
public Hub metadata is sufficient to discover candidate models while the current
Hermes bottleneck is evidence quality and safe evaluation, not GPU capacity.
The implementation adds no package, database, hosted endpoint, or paid inference.

## Primary-source receipt

| Claim | Primary source | Decision consequence |
|---|---|---|
| Model cards can carry license, datasets, evaluation results, intended uses, and limitations. | https://huggingface.co/docs/hub/model-cards | Read metadata only; missing license metadata is a blocking risk signal, not permission to infer a license. |
| Hub traffic is divided into API, resolver, and page rate-limit buckets; `429` responses expose rate-limit headers. | https://huggingface.co/docs/hub/en/rate-limits | Keep the daily job at one Hub request, cache locally, and back off rather than retrying aggressively. |
| Hub security includes malware, pickle, and secret scanning, but the documentation says security measures do not guarantee every repository is safe. | https://huggingface.co/docs/hub/security | Never treat a scan badge as execution authorization; download and execution remain outside this lane. |
| Access to gated models can disclose a user's username and email to model authors. | https://huggingface.co/docs/hub/en/models-gated | Never auto-request gated access and never use a website login in the ingestion job. |
| Repository-card metadata exposes structured fields such as license, datasets, evaluation results, and pipeline tags. | https://huggingface.co/docs/huggingface_hub/en/package_reference/cards | Normalize only fields returned by the public API and preserve missing values explicitly. |
| Inference Providers are metered and provider-priced. | https://huggingface.co/docs/inference-providers/pricing | No inference call belongs in the daily discovery loop; cost remains `$0`. |

The raw research response is stored at
`parallel-research/hugging-face-hermes-july-2026.json`. Its product and pricing
claims are treated as hypotheses unless the table above cross-checks them against
current Hugging Face documentation.

## Implemented high-ROI slice

- One public `GET /api/models` request per run, capped at ten records by default.
- Local deterministic ranking against the complete Hermes research query.
- SHA-256 source/content deduplication and a private JSONL corpus.
- Source-balanced output so popular model derivatives cannot crowd out papers.
- `0.20` score penalty plus proposal block when license metadata is missing.
- `0.10` score penalty plus proposal block for derived/quantized metadata.
- No artifact download, repository clone, dataset execution, dynamic import,
  `trust_remote_code`, hosted inference, or production routing mutation.

## What this improves

| Harness property | Before | After |
|---|---|---|
| Model discovery | Ad hoc browsing and memory | Dated, deduplicated public metadata receipt |
| Research prioritization | Popularity or intuition could dominate | Explainable relevance, recency, novelty, actionability, and risk score |
| Supply-chain boundary | Candidate and executable artifact could be conflated | Candidate metadata cannot cross into execution in this job |
| Cost control | A research idea could trigger hosted inference | Exactly two metadata requests across both sources and zero inference calls |
| Learning loop | No stable accept/reject dataset | Proposal IDs and hashes can later support offline calibration |

## Do not implement now

- Hugging Face Spaces for production Hermes or ThumbGate surfaces.
- Dedicated Inference Endpoints, GPUs, or paid serverless summarization.
- Automatic model, dataset, repository, pickle, or weight downloads.
- `trust_remote_code`, remote notebooks, or in-process Python evaluation.
- Uploading chats, task receipts, credentials, telemetry, or customer data.
- Automatic gated-model access requests.
- A vector database, Spark, Databricks, or Snowflake for this small daily corpus.

## Next evidence gate

The metadata loop may nominate an experiment, but it cannot approve adoption.
A candidate needs a primary-source review, compatible license, pinned revision,
isolated local benchmark, cost receipt, and existing Hermes regression gates.
No model-quality improvement is claimed until those measurements exist.
