# Hermes harness data strategy — July 2026

Deep-research run: `trun_d3be5e813aa949708f60154d99f96555`

Run receipt: <https://platform.parallel.ai/play/deep-research/trun_d3be5e813aa949708f60154d99f96555>

Raw cited report: [`parallel-research/hermes-cutting-edge-data-july-2026.md`](../parallel-research/hermes-cutting-edge-data-july-2026.md)

## Verdict

Do not buy a data subscription yet. The highest-signal evaluation and grounding
sources fit a $0 monthly data budget. Preserve the available $10 for a future
Hugging Face Pro workspace only after private feedback volume makes gated dataset
hosting necessary.

Do not put Spark, Databricks, or Snowflake in ThumbGate's request path. Keep D1
as the transactional store. Export sanitized, append-only feedback and task
metrics to an analytical Bronze layer; use DuckDB locally while event volume is
small. Snowflake is the first managed analytical destination because the existing
`HERMES.PUBLIC` and `HERMES_XS` setup is already operational. Before loading,
replace the current effectively `ACCOUNTADMIN` credential with a genuinely
restricted ingest/read role. Keep the warehouse `XSMALL`, auto-suspended, and
never upload prompt or response bodies.

Databricks/Spark remains a future trigger, not a current dependency. Adopt it
only when one of these measured thresholds is crossed:

- transformations no longer fit comfortably in a single-node DuckDB job;
- daily sanitized telemetry exceeds roughly 10 GB or requires sustained stream processing;
- model-feature pipelines need distributed training joins or Delta Lake time travel;
- an enterprise customer already standardizes on Databricks and pays for the integration.

## Ranked sources

| Priority | Source | Use | Monthly data cost | Guardrail |
| --- | --- | --- | ---: | --- |
| 1 | SWE-bench Verified + Lite | Repo-level regression evaluation | $0 | Keep held out; avoid training contamination |
| 2 | Terminal-Bench / Harbor | Terminal-agent evaluation and trajectory capture | $0 | Run sandboxed and budget compute separately |
| 3 | MCP-Atlas | MCP tool-selection evaluation | $0 | Confirm dataset terms before commercial training |
| 4 | GitHub Archive + Events API | Fresh issues, PRs, and engineering signals | $0 | Respect each repository's license |
| 5 | OpenHands trajectory datasets | Candidate supervised trajectories | $0 | Snapshot card, commit SHA, and license before ingest |
| 6 | OpenAlex + arXiv metadata | Research RAG and technique discovery | $0 | Full-text rights vary by paper |
| 7 | Stack Exchange dump | Error/Q&A retrieval | $0 | CC BY-SA attribution and derivative obligations |
| 8 | Vendor documentation | Fresh API RAG | $0 | Respect robots.txt, terms, and cache aggressively |

Common Crawl is useful only as a narrowly filtered RAG source; a bulk mirror is
too noisy and creates licensing, PII, storage, and egress risk. Reddit content is
not approved for the commercial corpus: official free API access is not a safe
commercial assumption, and third-party archives do not convey commercial rights.

## Bronze / Silver / Gold architecture

### Bronze — immutable evidence

- Store source URI, retrieval time, source commit/snapshot, license, SHA-256,
  split (`train`, `validation`, `test`), and raw object pointer.
- Store only sanitized ThumbGate telemetry: timestamps, model/provider, status,
  token counts, latency, route, tool-call flag, error category, and feedback signal.
- Exclude prompts, responses, credentials, local paths, emails, and device identifiers.

### Silver — governed features

- Normalize event and benchmark schemas.
- Deduplicate by content hash.
- Enforce licenses and test-set exclusion before producing any training view.
- Redact PII and reject secret-like strings.
- Calculate task success, lease recovery, latency, route, and feedback features.

### Gold — decisions

- Weekly eval scorecards: SWE-bench, Terminal-Bench, and MCP-Atlas.
- Product scorecards: thumbs-up rate, thumbs-down reason categories, failover
  success, p95 completion, and cost per completed task.
- Promotion gate: no model/harness rollout unless quality improves without a
  statistically meaningful safety, latency, or cost regression.

## Next bounded action

Start with a free, reproducible eval lane: SWE-bench Lite plus a small
Terminal-Bench smoke set, versioned manifests, and no training. Feed ThumbGate's
new explicit feedback signals into the sanitized metrics schema. Pay $9/month
for Hugging Face Pro only when private dataset hosting is actually required.

## Primary references

- <https://github.com/SWE-bench/SWE-bench>
- <https://www.tbench.ai/>
- <https://arxiv.org/abs/2602.00933>
- <https://www.gharchive.org/>
- <https://docs.openalex.org/>
- <https://archive.org/details/stackexchange>
- <https://commoncrawl.org/>
- <https://fly.io/docs/about/pricing/>
