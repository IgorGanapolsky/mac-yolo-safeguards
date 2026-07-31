# InfoQ July 2026 → Hermes / ThumbGate harness apply

Source: InfoQ Software Architects' Newsletter **July 2026** (Building Data Platforms),
saved as `~/Downloads/infoq.pdf`.

This is not a generic "data platform" build. It maps newsletter patterns onto the
**agent harness + retrieval stack** we already run.

## How the newsletter improves *our* harness

| InfoQ signal | What it means here | What we shipped |
|--------------|--------------------|-----------------|
| **Monzo governed data mesh** — interface models, CI-enforced structure, named layers | Stop treating grepae / harness / lessons folders as accidental state. Each is a **product interface** with owner + required artifacts. | `tools/retrieval-interface-contracts.js` |
| **Anthropic analytics** — success from semantic definitions + governance, not bigger models | A+ scorecard already hard-gates retrieval; contracts add **semantic catalog** of what agents may depend on. | contracts + scorecard gate `interface-contracts` |
| **Cloudflare Town Lake** — unify fragmented access | Agents should discover one catalog of retrieval interfaces instead of inventing paths. | contracts `--json` lists interfaces |
| **Delta index micro-batch** (Saini) — 10min→30s lag via watermark cycles, not record-stream | grepae + lessons should advance on **HEAD / mtime watermarks**, restart watcher via watchdog, skip intermediate commits, flag periodic full rebuild. | `tools/index-microbatch.js` |
| **DBOS / durable execution** — queues in the DB, SKIP LOCKED, no extra orchestrator | Heal jobs claimable in local SQLite without Temporal/k8s. | `tools/durable-job-queue.js` |
| **Agent evals** (Datadog webinar) | Keep multi-case retrieval eval + scorecard as production gate. | existing `rag-retrieval-eval` + extended scorecard |

## What we deliberately did *not* build

- A second data warehouse or dbt mono-repo (no ROI vs grepae + lessons).
- Record-level streaming reindex (InfoQ case study abandoned it for grouped index state).
- Cloud-only orchestrators for Mac-local indexes.

## Operator commands

```bash
# Governed interfaces (CI-friendly)
node tools/retrieval-interface-contracts.js --json

# Micro-batch cycle (LaunchAgent-friendly)
node tools/index-microbatch.js --once --heal --json

# Durable queue for heal workers
node tools/durable-job-queue.js enqueue --type index-microbatch --json
node tools/durable-job-queue.js claim --worker local --json
node tools/durable-job-queue.js complete --id N --json

# Full A+ gate (includes new interfaces + microbatch)
node tools/rag-stack-scorecard.js --heal --json
```

## Expected system effects

1. **Fewer false "index is fine"** — contracts fail closed on empty shells / missing paths.
2. **Lower freshness lag** — micro-batch pulls isolated clone + restarts grepae when down without waiting for a human.
3. **Recoverable heal** — durable jobs retry after crash; leases expire.
4. **Harness discipline** — scorecard A+ now requires interface + microbatch gates, not only eval recall.
