# Linear agent closeout telemetry

**Policy start:** 2026-08-09T15:10:00Z
**Linear lane:** AGENT-336

Every completed issue must answer four questions in Linear itself:

1. Which agents contributed?
2. How long did the issue take from `startedAt` to completion or PR merge?
3. When a PR exists, how long did it take from PR creation to merge?
4. What bottleneck will we remove or shorten next time?

The implementation deliberately uses stable, low-cardinality labels for filtering and exact values in one idempotent completion comment. Free-form durations or improvement prose must not become one-off labels.

## Label contract

| Dimension | Labels | Rule |
|---|---|---|
| Contributors | `agent-codex`, `agent-grok`, `agent-Hermes`, etc. | Preserve every contributor label after completion. Remove only `agent-lock`. |
| Issue duration | `cycle-under-15m`, `cycle-15m-1h`, `cycle-1h-4h`, `cycle-4h-1d`, `cycle-1d-3d`, `cycle-over-3d` | Derived from Linear `startedAt` (fallback: `createdAt`) to issue completion or verified PR merge. |
| PR duration | Same buckets with prefix `pr-cycle-` | Derived from live GitHub `createdAt` to `mergedAt`. A merely open or closed-unmerged PR fails closed. |
| Outcome | `outcome-issue-closed` or `outcome-pr-merged` | Searchable closure truth. |
| Next optimization | `speed-next-auth`, `speed-next-ci`, `speed-next-handoff`, `speed-next-research`, `speed-next-reuse`, `speed-next-review`, `speed-next-scope`, `speed-next-tests`, `speed-next-tooling`, `speed-next-other` | Category stays searchable; exact improvement experiment lives in the comment. |

## Closeout command

Preview first. Preview performs Linear and GitHub reads but zero writes:

```bash
node tools/linear-closeout-telemetry.js \
  --issue AGENT-336 \
  --agents codex,grok \
  --pr https://github.com/OWNER/REPO/pull/123 \
  --bottleneck "CI queue wait" \
  --improvement-category ci \
  --improvement "Run the focused gate before opening the PR and request CI once." \
  --evidence "https://github.com/OWNER/REPO/actions/runs/123" \
  --json
```

After the preview is correct, apply the same command with `--apply`. Apply:

- creates missing stable labels;
- preserves unrelated labels and every `agent-*` contributor label;
- validates the whole closeout, moves the issue to Done, and re-reads Linear's authoritative `completedAt` before calculating a no-PR issue duration;
- posts one SHA-256-marked closeout comment, updating that same comment once if Linear's authoritative timestamp changes and reusing it on later retries;
- removes `agent-lock` and stale telemetry labels;
- moves the issue to the team's completed state;
- writes the completion receipt into `AI-Agent-Sync/Handoffs/linear-claims/`.

## Audit

Audit issues completed since the policy start:

```bash
node tools/linear-closeout-telemetry.js --audit --team AGENT --strict --json
```

`--strict` exits nonzero when any completed issue is missing a contributor, cycle, outcome, or next-speed label. Historical issues before the mandate are excluded unless `--since` is supplied.

## Operating protocol

1. Claim the issue through `linear-agent-bridge.js`; this creates `agent-lock` and the first contributor label.
2. When another agent contributes materially, add it with `--agents` during closeout. Do not replace earlier `agent-*` labels.
3. Use live Linear timestamps and, when applicable, live merged-PR metadata. Never type a guessed duration.
4. Name the observed bottleneck, not a generic aspiration.
5. Write the next improvement as a testable process change: what will be done earlier, cached, automated, reused, or removed.
6. Run the strict audit as the final coordination check.

This matches Linear Agent's current model: workspace context and activity live on the issue; comments are the durable place for concise progress, risks, actions, and handoffs; repeatable workflows belong in shared skills and loops; team guidance standardizes issue fields and updates. See [Linear Agent documentation](https://linear.app/docs/linear-agent).
