# OpenRouter + Graphify System Upgrades

Two June 2026 signals matter for Hermes:

1. OpenRouter exposes one `reasoning.effort` dial that maps across providers.
2. Graphify can turn repos, docs, PDFs and diagrams into a queryable knowledge
   graph for coding assistants.

## Why This Helps Hermes

### Provider Reliability

Hermes has failed when a configured model/provider did not support the requested
mode. A provider-neutral reasoning plan lets us route tasks by risk without
rewriting provider-specific controls.

Use:

```sh
node tools/openrouter-reasoning-plan.js --effort high --json
```

Recommended policy:

- `minimal`: classification, routing, status formatting
- `low`: simple edits and summaries
- `medium`: normal coding and repo triage
- `high`: multi-step debugging, CI failures, PR review, user distrust loops
- `xhigh`: rare incident analysis where cost is justified

### Repo Memory and Context

Hermes should not repeatedly ask the LLM to reread broad code areas. For broad
repo questions or cross-file debugging, run a graph pass first and query the
result.

Use:

```sh
node tools/graphify-readiness.js --json
```

If Graphify is missing, the tool emits the exact install command and falls back
to targeted `rg`/file reads. It must not claim a graph exists unless one was
built.

## Operating Rule

When an external artifact is about models, reasoning, RAG, knowledge graphs, or
agent reliability:

1. Convert it into an implementation plan.
2. Add a deterministic tool or test where possible.
3. Produce action lanes instead of passive notes.
4. Verify with local tests and CI before claiming the system improved.

## High-ROI Action Lanes

- `reasoning-router`: normalize effort and avoid model-specific control drift.
- `knowledge-graph`: build/query Graphify before broad repo reasoning.
- `cost-guard`: reserve high reasoning effort for tasks where it pays.
- `context-trust`: prove what context was indexed or extracted.
- `agent-os`: turn lessons into tested repo tools, PRs, and follow-up checks.
