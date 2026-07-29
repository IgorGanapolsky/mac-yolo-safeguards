# Hermes State and Security Harness

This adds two independent gates to Hermes without replacing the existing agent-swarm,
loop-state, outcome, or latency evaluators.

## Why these exist

OpenAI's Codex Security CLI can scan repositories, retain findings between runs,
validate fixes, export SARIF, and fail on a severity threshold. The Hermes adapter uses
the official CLI's exported SARIF rather than inventing another vulnerability scanner.
It adds one missing rule: a successful `--dry-run` proves only that inputs are valid; it
must never be reported as a successful security scan.

Perplexity's SPACE design treats durable, resumable, forkable state as the difficult
part of long-running agents. Its primary research write-up describes durable local
snapshots and moving them between nodes. Hermes already uses Git worktrees for source
isolation and has a mutable `latest.json` loop-state packet. The checkpoint tool binds
those surfaces into immutable receipts with parent/root lineage and integrity
verification.

Sources:

- [OpenAI Codex Security](https://github.com/openai/codex-security)
- [OpenAI announcement](https://x.com/OpenAI/status/2082263717916586117)
- [Perplexity: Making SPACE](https://research.perplexity.ai/articles/making-space-secure-and-efficient-runtimes-for-long-running-agents)
- [The New Stack interview and architecture discussion](https://thenewstack.io/perplexity-space-agent-sandboxes/)

## Checkpoint lifecycle

Create before a risky or long-running leaf:

```bash
node tools/hermes-harness-checkpoint.js create \
  --task-id T-EXAMPLE \
  --repo "$PWD" \
  --json
```

Fork a successor run from an immutable receipt:

```bash
node tools/hermes-harness-checkpoint.js fork \
  --task-id T-EXAMPLE-FORK \
  --parent ~/.hermes/receipts/harness-checkpoints/cp_....json \
  --repo "$PWD" \
  --json
```

Verify before resuming:

```bash
node tools/hermes-harness-checkpoint.js verify \
  --checkpoint ~/.hermes/receipts/harness-checkpoints/cp_....json \
  --repo "$PWD" \
  --json
```

The receipt stores hashes and counts, not prompts, diffs, credentials, or source
contents. Git remains the source snapshot/fork layer. A changed commit, dirty-state
digest, loop-state packet, mobile proof, or receipt integrity hash makes verification
red. `summary` reports checkpoint count, invalid receipts, maximum fork generation, and
P50/P95/P99 checkpoint latency.

### What can go wrong

- A mutable `latest.json` can move after an agent summarizes it.
- A resumed worker can be on another commit or inherit a different dirty worktree.
- Copying full worktrees would waste disk and can copy secrets.
- A receipt can be edited after the fact.

The tool therefore writes immutable mode-0600 receipts, records no file contents, uses
Git's existing object/worktree model, and verifies integrity plus state drift before
resume.

### How to measure it

- Checkpoint verification pass rate before resume.
- Integrity failures and state-drift reasons.
- Maximum fork depth.
- P50/P95/P99 checkpoint creation latency.
- Incidents resumed from chat prose without a valid checkpoint: target zero.

## Codex Security lifecycle

Zero-cost readiness check:

```bash
node tools/codex-security-gate.js preflight --repo "$PWD" --json
```

This invokes pinned `@openai/codex-security@0.1.3 scan --dry-run`. It deliberately
exits `2` and writes `securityVerified: false`; readiness is not a security result.

After an authorized completed scan, export SARIF using the official CLI:

```bash
npx @openai/codex-security@0.1.3 export SCAN_DIR \
  --export-format sarif \
  --output candidate.sarif \
  --source-root "$PWD"

node tools/codex-security-gate.js evaluate \
  --baseline baseline.sarif \
  --candidate candidate.sarif \
  --threshold high \
  --json
```

The gate matches findings by stable SARIF fingerprint. Existing baseline findings do
not block a PR; new findings at or above the threshold do. Resolved findings are
counted explicitly. Receipts retain only input digests, counts, severities, and rule
IDs—never finding messages or source excerpts.

### What can go wrong

- Missing authentication produces a skipped scan that CI mistakenly calls green.
- Scanning every PR without a cost ceiling creates uncontrolled spend.
- Line-number matching turns moved code into noisy “new” findings.
- A baseline can normalize known critical debt forever.

The adapter refuses dry-run as pass, uses stable fingerprints, distinguishes new,
persisting, and resolved findings, and keeps cost/authentication outside the result
gate. Baseline age and unresolved critical debt remain visible review decisions.

### How to measure it

- New critical/high findings per candidate.
- Resolved versus persisting findings per run.
- Percentage of security claims backed by a completed SARIF export.
- Scan cost and P95/P99 scan duration from Codex Security's own saved scan history.
- False-green count where readiness or missing authentication was called a scan pass:
  target zero.

## Deliberate non-adoptions

- No Firecracker, Kubernetes, or Btrfs layer: Hermes runs at laptop/fleet scale and
  already has Git worktrees. A new VM control plane would cost more than it saves.
- No required paid scan in CI yet: the repository has no `OPENAI_API_KEY` Actions
  secret. A secret-dependent job would be permanently red or silently skipped.
- No automatic patching or publishing: security fixes still require the repository's
  existing tests, reviews, and merge gates.
