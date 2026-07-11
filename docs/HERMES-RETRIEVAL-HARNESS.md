# Hermes Retrieval Harness

`tools/hermes-retrieval-harness.js` is the local, dependency-free evidence layer
for Hermes harness decisions. It gives agents a bounded way to inventory,
retrieve, read, and grep repo text before making architecture, SDD, or release
claims.

It intentionally does not create a hosted index, call a provider, write secrets,
or replace Graphify. It complements Graphify by giving the decision stack a
plain local fallback when the graph misses the relevant files.

## Commands

```bash
node tools/hermes-retrieval-harness.js inventory --json
node tools/hermes-retrieval-harness.js retrieve --query "Specification-Driven Design guardrails" --json
node tools/hermes-retrieval-harness.js read --path tools/hermes-research-intelligence.js --start 1 --end 80 --json
node tools/hermes-retrieval-harness.js grep --pattern "gap analysis" --json
```

## Guardrails

- Only text-like repo files are indexed.
- Build, dependency, artifact, and worktree directories are skipped.
- `read` refuses paths outside the repo.
- Results are citations and snippets, not completion claims.
- Secret-bearing runtime files are not needed for normal use.

## SDD Fit

The July 10 SDD audit gap was that Hermes could reason about guardrails, but did
not have a repo-local retrieval receipt for generic specification language. This
harness closes that gap: a PDF/email/source note can now be turned into a local
query, file citations, readback, and focused follow-up tests before any
implementation claim is made.
