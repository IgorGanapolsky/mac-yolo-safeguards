# Graphify atomic freshness contract

Graphify exists to answer cross-file architecture and causality questions without
making an agent read the whole repository. It is useful only when the served
graph is structurally valid, derived from the current canonical source, built
with one compatible Graphify implementation, and known to answer a canary.

## Production path

`tools/graphify-snapshot.js` is the only supported refresh path:

1. Fetch and require a clean source checkout exactly at `origin/main`.
2. Require the installed Graphify package and skill versions to match.
3. Build into a private temporary directory, never `graphify-out/`.
4. Validate JSON, non-empty nodes and links, unique node IDs, at least one known
   endpoint per link, and at least 90% endpoint coverage. Graphify intentionally
   represents some standard-library and package imports as external endpoints.
5. Query the candidate with a known-answer canary.
6. Add a receipt containing source SHA, build time, versions, counts, candidate
   hash, and canary result.
7. `fsync` and atomically rename one `graph.json` into the served location.

The graph and its proof receipt are one atomic object. Compatibility HTML and
reports are not health authorities.

Caller-supplied candidate graphs are rejected. The refresher must build the
candidate itself after establishing the source state; otherwise an obsolete
graph could be falsely stamped with the current SHA.

```bash
node tools/graphify-snapshot.js --json
node tools/graphify-staleness-check.js --strict --json
```

`--update` starts the snapshot refresher in the background and reports only its
PID and log path. Process start is not rebuild or publication success. A
subsequent strict health check establishes success.

## Why each gate exists

| Gate | What can go wrong without it | How working is measured |
|---|---|---|
| Clean exact `origin/main` source | A dirty, untracked, or stale checkout becomes apparent production truth | Receipt `sourceSha` equals freshly fetched `origin/main`; strict health has no `source_sha_lag` |
| Package/skill version equality | An old installed skill invokes semantics different from the package that built the graph | Package and skill versions are equal at build and query time |
| Private candidate build | Readers observe truncated JSON or a half-written graph | Concurrent-reader mutation test observes zero JSON parse failures across 200 swaps |
| Structural validation | Empty graphs, duplicate nodes, or mostly disconnected links publish as “fresh” | Candidate has nonzero counts, unique node IDs, one known endpoint per link, and at least 90% endpoint coverage |
| Query canary | A parseable graph with unusable retrieval still publishes | Candidate query exits zero and returns at least one result before rename |
| Candidate payload hash | A graph can be edited after publication while retaining a plausible receipt | Recomputed payload SHA-256 equals receipt `candidateHash` |
| Atomic receipt + graph | Separate metadata and graph files disagree after a partial write | One `graph.json` contains both; one rename is the commit point |
| Last-good preservation | A failed rebuild destroys the only working graph | Corruption, source-lag, mismatch, and canary mutation tests preserve the old byte hash |
| MCP fail-closed health | Agents confidently query stale architecture | Search, symbol, and path calls do not spawn Graphify unless strict health is green |

## Failure behavior

- A dirty checkout, stale source SHA, version mismatch, failed extraction,
  invalid candidate, failed canary, or publication error exits nonzero.
- The previously served graph remains byte-for-byte unchanged before the atomic
  rename.
- A legacy graph without `_hermesSnapshot` is readable for diagnosis but is not
  safe to serve.
- Missing `origin/main` truth is unhealthy, not an implicit pass.
- A health check fetches `origin/main`; fetch failure is unhealthy rather than
  permission to trust a potentially stale remote-tracking ref.
- A background PID proves only that the refresh process started. The log and
  strict health result prove the later outcome.

## Quality target

This lane is A-grade only when all of the following are true on the same
artifact:

- strict health exits zero;
- `sourceSha` equals current `origin/main`;
- package and skill versions match;
- graph structure and payload hash validate;
- canary result count is nonzero;
- snapshot age is at most 48 hours;
- the focused mutation/concurrency suite and repository Node suite pass.

Retrieval relevance beyond the structural canary is a separate evaluation
surface. Graphify health must not be presented as Recall@k, MRR, or nDCG proof.
