# AI regression-control architecture — July 2026

Research receipt: Parallel deep-research run
`trun_5e3eaa2b7dc3426093a1852b55847b35`, completed and ingested on
2026-07-26. The raw report and machine-readable result are in
[`parallel-research/ai-regression-controls-july-2026.md`](../parallel-research/ai-regression-controls-july-2026.md)
and
[`parallel-research/ai-regression-controls-july-2026.json`](../parallel-research/ai-regression-controls-july-2026.json).
This decision document narrows that broad research to controls supported by
primary standards and the failures reproduced in this repository.

## Verdict

Preventing regressions is a control-loop problem:

1. give every layer a versioned contract and a frozen regression set;
2. block promotion on deterministic safety and behavior invariants;
3. use diagnostics for drift that cannot be reduced to a stable pass/fail rule;
4. deploy through offline, shadow, canary, and production rings;
5. connect the production outcome to the exact change, eval, tool calls, and
   deployment that produced it;
6. turn every escaped recurring failure into a deterministic test or guard.

No test tier proves the tier after it:

```text
static/unit -> integration -> physical fresh-user E2E -> required CI
            -> deployed artifact identity -> live outcome and SLO
```

The architecture is working only when this chain is attributable end to end.
“Unit tests passed,” “installed on a phone,” “CI passed,” and “deployed” are
different facts.

NIST's AI RMF requires objective, repeatable test, evaluation, verification,
and validation; evaluation in conditions similar to deployment; production
monitoring; and an ongoing response loop. That is the governing model here,
not a one-time launch checklist.
[NIST AI RMF Core](https://airc.nist.gov/airmf-resources/airmf/5-sec-core/)

## One evidence receipt

Every evaluation, deployment, and live trace must carry or resolve to:

```json
{
  "run_id": "stable end-to-end identifier",
  "change_sha": "source commit",
  "component_versions": {
    "model": "provider/model/version",
    "prompt": "content hash",
    "retriever": "embedding+chunker+reranker+index",
    "tools": "schema and implementation versions",
    "mcp": "protocol and server versions"
  },
  "eval_set_sha": "immutable evaluation corpus hash",
  "environment": "offline|shadow|canary|production",
  "artifact": "build id, device class, channel and deployment id",
  "trace_id": "OpenTelemetry-compatible trace identifier",
  "tool_calls": "ordered, redacted call receipts",
  "side_effect_receipts": "provider readbacks or durable local evidence",
  "gate_results": "named checks with thresholds and outputs",
  "live_outcome": "task success, user impact and SLO result"
}
```

Secrets, full prompts, user content, tokens, and raw retrieved documents do not
belong in this receipt. Store content hashes, classifications, bounded
citations, and redacted metadata instead.

OpenTelemetry now maintains GenAI conventions spanning clients, agent
orchestration, MCP, metrics, spans, and events. Use those conventions where
stable, but keep an internal schema-version field because the GenAI conventions
are still evolving.
[OpenTelemetry GenAI semantic conventions](https://github.com/open-telemetry/semantic-conventions-genai)

## 1. RAG system

**Why this architecture?** Retrieval correctness is a composition of corpus,
access filtering, chunking, embeddings, ranking, prompting, and generation.
Version and evaluate the pipeline as one releaseable artifact while measuring
retrieval and answer generation separately. This local vault remains the
canonical evidence store; runtime indexes are replaceable derivatives.

**What can fail?**

- relevant evidence is absent, stale, duplicated, or cut into unusable chunks;
- an embedding, chunker, or reranker change silently changes recall;
- access filters leak documents across users or projects;
- prompt injection or poisoned documents override system policy;
- a fluent answer is unsupported, cites the wrong source, or cites no source;
- the gold set is stale, narrow, contaminated by production answers, or
  accidentally excluded from the test run;
- the RAG client falls back to a provider or index different from the one the
  evaluation measured.

**How do you measure it?**

- Hard gates: gold-query coverage is nonzero; access-control fixtures never
  cross boundaries; required source recall@K does not regress beyond its
  risk-budget; supported-claim and citation-precision tests pass; index and eval
  fingerprints match the candidate.
- Diagnostics: recall@K, MRR/nDCG, no-answer precision, unsupported-claim rate,
  citation precision/coverage, retrieval latency, corpus freshness, duplicate
  rate, query-class slice performance, and user correction rate.
- Set thresholds from a reviewed baseline and per-class risk tolerance. Do not
  copy universal-looking numbers from a vendor benchmark.

**How do you secure it?** Authorize before retrieval, not after generation.
Label every source with tenant, sensitivity, provenance, and retention policy.
Use allowlisted ingestion, immutable source hashes, malware/content scanning,
document-level ACL tests, encryption, secret redaction, and retrieval-prompt
injection tests. Treat retrieved text as untrusted data.

**How do you deploy it?** Build an immutable index candidate; replay the frozen
gold set; shadow production queries without serving the candidate answer;
canary by tenant or traffic slice; then promote the exact index/model/prompt
fingerprint. Keep the last known-good index and prompt independently
rollbackable.

**How do you know it works?** A gold query returns the required bounded source,
an answer's material claims resolve to that source, forbidden sources never
appear, canary quality stays inside its regression budget, and production
corrections/abstentions remain within the SLO. This session's bounded
`vault-brain verify` passed, but ThumbGate recall found zero matching lessons
for the current regression class; that is a coverage gap, not proof that the
RAG layer is healthy.

## 2. Agent with tools

**Why this architecture?** Once a model can write files, send messages, merge
code, or call enterprise APIs, its output is a transaction. Separate planning
from authorization and execution; put a deterministic policy gate immediately
before the side effect; require a readback receipt after it.

**What can fail?**

- the model selects the wrong tool, target, arguments, order, or environment;
- a tool schema or provider behavior changes;
- retrying repeats a non-idempotent side effect;
- a tool reports success without changing the intended state;
- error text is mistaken for data and drives the next action;
- prompt injection expands scope or exfiltrates data;
- an approval is self-issued, stale, too broad, or detached from the exact
  action;
- tests mock away the side effect or run zero cases while returning success.

**How do you measure it?**

- Hard gates: schema conformance; exact-target resolution; policy decision;
  idempotency-key behavior; deny-path tests; zero-test detection; success
  requires a provider/local readback; consequential actions require an
  independent approval receipt.
- Diagnostics: task success by scenario, tool-selection precision, retries,
  step count, latency/cost, denial rate, recovery rate, unintended side effects,
  human overrides, and escaped incident rate.

**How do you secure it?** Give each tool the minimum identity, scope, filesystem
root, network destination, and lifetime it needs. Keep secrets in native secret
stores. Validate targets again at execution time. Use allowlists and egress
controls, sandbox untrusted code, redact traces, make high-impact actions
reversible when possible, and never let the agent authorize its own privileged
action.

**How do you deploy it?** Run contract tests against assertion-only fakes, then
integration tests in an isolated tenant, shadow the tool plan without effects,
canary low-impact actions, and expand scopes only after measured success.
Version tool schemas and roll them independently from prompts/models.

**How do you know it works?** The requested state is verified by an independent
read, repeated calls are safe, deny cases stay denied, and no unapproved
external effect occurs. This branch found a pre-commit command that printed
“No tests found” but exited successfully because `--passWithNoTests` was
enabled; the corrected gate now fails unless its related tests actually run.

## 3. Multi-agent workflow

**Why this architecture?** Parallel agents need isolation plus one serialization
point. Use one task, owner, worktree, and branch per worker; explicit file
leases; append-only decisions; and sequential integration onto protected
`main`. The task board is coordination metadata, not a substitute for Git
isolation.

**What can fail?**

- two agents edit the same hot file or reinterpret the same decision;
- cleanup deletes an active or dirty worktree;
- a lease expires while the worker is still alive;
- a stale branch is merged over a newer invariant;
- an agent closes work without tests, leaves uncommitted WIP, or reports another
  agent's proof as its own;
- merge queues pass individually valid changes whose combination regresses the
  product;
- orchestration optimizes commit count instead of finished acceptance checks.

**How do you measure it?**

- Hard gates: exactly one active owner per claimed file; no hot-file change
  without a decision reference; clean rebase; focused and full gates on the
  integrated commit; cleanup deletes zero existing active/dirty worktrees;
  required CI is green on the merge SHA.
- Diagnostics: conflicting claims, abandoned leases, rework, merge-conflict
  rate, time to finished acceptance check, rollback rate, orphan branches, and
  queue age.

**How do you secure it?** Use separate identities and least-privilege
credentials; protect `main`; require signed/auditable changes where appropriate;
prevent workers from deleting foreign branches, claims, or worktrees; and
exclude secrets from copied worktree state. Cleanup should audit by default.
Git documents that `prune` removes metadata for already-missing worktrees,
while `remove --force` can delete an unclean tree; those are different
operations and must never be conflated.
[Git worktree documentation](https://git-scm.com/docs/git-worktree.html)

**How do you deploy it?** Claim and commit coordination metadata first, implement
one bounded leaf, run stacked verification, rebase on current `main`, rerun
integration gates, open a PR with decision and evidence receipts, and merge
sequentially. Release the claim only after the merge SHA and post-merge CI are
known.

**How do you know it works?** No agent's active/dirty state is lost, every
changed line has one accountable owner, acceptance checks pass on the integrated
SHA, and the live artifact resolves to that SHA. The hourly hygiene job in this
repo had been force-removing every secondary worktree and recursively deleting
Git metadata. Its replacement is audit-only and prunes only registrations whose
directories are already missing.

## 4. MCP-based enterprise integration

**Why this architecture?** MCP standardizes discovery and invocation, not
enterprise trust. Treat each MCP server as an OAuth resource server and each
downstream system as a separate trust boundary. Bind tokens to one resource,
authorize every request, and issue a separate downstream credential rather
than forwarding the client's token.

**What can fail?**

- token passthrough or wrong-audience acceptance creates a confused deputy;
- scopes are broad, stale, or interpreted differently by client and server;
- session IDs, tool names, descriptions, or tool output are trusted as identity;
- dynamic registration or redirects are abused;
- tool/schema changes break callers or quietly expand capability;
- SSRF, prompt injection, oversized payloads, replay, or retry duplication;
- audit events cannot be joined across the MCP client, server, and provider.

**How do you measure it?**

- Hard gates: 100% audience validation; authorization on every HTTP request;
  zero token passthrough; exact redirect and PKCE tests; scope allowlist;
  malformed/replay/expired-token rejection; schema compatibility; idempotency
  and provider readback for writes.
- Diagnostics: 401/403 by reason, scope-escalation attempts, token age,
  cross-resource attempts, tool latency/errors, schema-version adoption,
  provider reconciliation mismatches, and audit completeness.

**How do you secure it?** Follow OAuth 2.1, PKCE, HTTPS, short-lived credentials,
resource indicators, audience validation, per-request authorization, and
least-privilege scopes. Never put access tokens in query strings and never use
`Mcp-Session-Id` as authorization. An MCP server calling a downstream API uses a
separate downstream token. The MCP specification explicitly requires intended-
audience validation and forbids token passthrough.
[MCP authorization specification](https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization)
[MCP security best practices](https://modelcontextprotocol.io/docs/tutorials/security/security_best_practices)

**How do you deploy it?** Publish versioned resource metadata and schemas;
contract-test clients against a conformance server; run security negative tests;
deploy an isolated tenant; shadow reads; canary read-only scopes; then enable
bounded writes with idempotency and reconciliation. Roll back server, schema,
and authorization policy independently.

**How do you know it works?** A valid least-privilege token can perform only its
declared operation; wrong-audience, expired, replayed, over-scoped, and session-
only requests fail; every approved write reconciles with the downstream
provider; and one redacted trace joins client, MCP server, and provider receipt.

## 5. Production AI with evaluation and observability

**Why this architecture?** Offline evals find known failures; observability finds
unknown failures in real contexts. Neither replaces the other. Use a single
promotion control plane that combines immutable evals, release metadata,
distributed traces, SLOs, incident feedback, and rollback.

**What can fail?**

- the eval set is stale, leaked, statistically noisy, or unrepresentative;
- a judge model or threshold changes without re-baselining;
- unit/CI success masks native, network, device, identity, or provider failure;
- a canary is too small or lacks the failure slice;
- telemetry drops, contains sensitive content, has inconsistent IDs, or cannot
  identify the deployed artifact;
- dashboards are green while the user task fails;
- rollback exists on paper but is slow, coupled, or untested.

**How do you measure it?**

- Hard gates: eval-set fingerprint and nonzero coverage; scenario risk budgets;
  security tests; physical release-device E2E for mobile changes; required CI;
  artifact-to-SHA attestation; canary error/task-success budgets; rollback
  readiness.
- Diagnostics: slice-level task success, groundedness, abstention/correction,
  latency, availability, cost, token/tool usage, crash-free sessions, trace
  completeness, user abandonment, and business outcome.
- Report uncertainty and sample size. Separate service health from task success.

**How do you secure it?** Data-minimize telemetry, redact before export, encrypt,
apply role-based access and retention, separate evaluation data from production
identity, audit config changes, test model/prompt/tool supply-chain updates, and
include abuse, privacy, and fail-safe cases in the eval suite.

**How do you deploy it?** Promote the exact version tuple through offline replay,
integration, physical-device E2E, shadow, canary, and progressive rollout.
Automatically stop promotion on hard-gate failure. Keep model, prompt, index,
tool, policy, mobile OTA, and backend rollback independently addressable.

**How do you know it works?** The live task succeeds for the intended user slice,
within its SLO, on an artifact attributable to the evaluated SHA and versions;
traces are complete enough to explain failure; a synthetic or real incident
triggers the right alert; rollback restores the last known-good behavior; and
the escaped incident becomes a new frozen regression case.

## Hard gates versus diagnostics

Use a hard gate only when the fact is deterministic enough to block safely and
the failure impact justifies it. Use diagnostics to detect distributional drift
and establish the evidence for a future gate.

| Layer | Promotion-blocking facts | Drift and learning signals |
|---|---|---|
| RAG | nonzero gold run, ACL isolation, required retrieval/citation invariant, matching fingerprints | recall/ranking slices, corpus freshness, unsupported claims, corrections |
| Tool agent | schema/target/policy, deny path, idempotency, independent effect receipt, no zero-test pass | plan drift, retries, cost, overrides, recovery |
| Multi-agent | one owner, safe worktree, integrated-SHA gates, merge CI | contention, rework, abandoned leases, queue time |
| MCP | per-request auth, audience, no passthrough, scopes, replay rejection, write reconciliation | auth failures, schema adoption, provider mismatch, latency |
| Production | eval identity, representative critical slices, device/CI/artifact/canary gates, rollback ready | online quality, task SLO, crash/latency/cost, user and business outcomes |

## Hermes 30/60/90-day implementation

### Days 0–30: stop false greens and data loss

- Keep worktree hygiene audit-only; test that clean and dirty active trees
  survive every run.
- Make zero tests, skipped required device proof, missing eval fingerprints, and
  missing provider readbacks fail closed.
- Turn the July pairing/onboarding incidents into a frozen fresh-user release
  matrix: no saved profile, stale key, secretless repair, Wi-Fi, cellular,
  MacBook/Mac mini, named discovery, unavailable host, and retry.
- Give each test/deploy a receipt with source SHA, release APK/OTA identity,
  device, eval-set hash, and outcome.
- Curate the RAG gold set from real incidents and verify both “must retrieve” and
  “must not retrieve” cases.

### Days 31–60: close the CI-to-production gap

- Propagate one trace ID from mobile through gateway, agent, MCP, tool, and
  provider readback using redacted OpenTelemetry-compatible spans.
- Add shadow evaluation and a bounded canary for prompt/model/retriever/tool
  changes.
- Add MCP conformance and security-negative tests: audience, passthrough, PKCE,
  scope, replay, SSRF, schema compatibility, and idempotency.
- Exercise independent rollback of OTA, prompt/model routing, retriever index,
  MCP policy, and gateway.

### Days 61–90: close the production feedback loop

- Join task success, crash/latency SLOs, user correction/abandonment, and
  downstream receipts to the release tuple.
- Promote only when critical offline slices, physical-device proof, CI, canary,
  and rollback readiness all pass.
- Automatically add reviewed production incidents to the frozen eval corpus;
  require provenance, deduplication, sensitivity labels, and an eval-set SHA.
- Run quarterly failure drills for stale credentials, unavailable Macs,
  poisoned retrieval, wrong-audience tokens, duplicate writes, telemetry loss,
  and rollback.

## Immediate repository controls from this incident

| Reproduced regression | Root cause | Permanent control |
|---|---|---|
| “Re-pair this Mac” opened generic discovery | secretless `pairCode` was parsed but never exchanged; stale key was probed | exchange current one-time code, probe with fresh key, forbid generic scan in repair regression tests, release-device proof |
| computer count had no identity | progress counted probe candidates while UI withheld named rows | count only surfaced profiles and render name/address rows immediately |
| QR remained in first-run onboarding | old optional path leaked into primary UX | QR removed from first-run contract; optional settings surface kept separate |
| active worktrees disappeared during tests | hourly script used force removal and recursive metadata deletion | audit-only cleanup; prune already-missing registrations; deterministic survival test |
| commit passed with no related tests | ignored `.worktrees` path plus `--passWithNoTests` | override only the worktree ignore for the hook and fail on zero tests |

These controls prevent the exact failures already observed. The remaining proof
obligation is the same for every future change: pass on the integrated commit,
install the attributable release artifact, exercise the fresh-user physical
path, observe the live outcome, and retain the receipt.
