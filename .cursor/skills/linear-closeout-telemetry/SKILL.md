---
name: linear-closeout-telemetry
description: >
  Repeatable workflow for closing out Linear AGENT-* issues with stable
  contributor, cycle-time, PR-cycle, outcome, and next-speed labels plus one
  idempotent SHA-256-marked closeout comment. Codifies the AGENT-336 policy
  so handoffs, codex, grok, or any agent can run it without re-deriving it.
safety: >
  Live Linear writes are gated to a single agent at a time (agent-lock).
  All writes go through tools/linear-closeout-telemetry.js which validates
  the whole closeout before moving the issue. Never hand-type durations or
  free-form improvement prose as labels. Linear PAT stays in keychain
  service LINEAR_API_KEY; never paste it.
---

# linear-closeout-telemetry

## What this is

A single, repeatable closeout flow for `AGENT-*` issues in the `AGENT` team.
It exists because prior agent sessions re-derived the same four questions on
every ticket (agent-336 codex, 2026-08-09). This skill captures the exact
command surface and label contract so the workflow is copy/paste from the
next session onward.

The reference implementation is `tools/linear-closeout-telemetry.js` with
`tests/test-linear-closeout-telemetry.js`. Both ship on PR #1585
(feat(coord): add Linear closeout telemetry), which is OPEN and GREEN. The
spec this skill encodes is `docs/agents/linear-closeout-telemetry.md`
(policed 2026-08-09T15:10:00Z).

## Policy: the four questions every closed issue answers

1. Which agents contributed?
2. How long did the issue take from `startedAt` to completion (or verbatim PR merge)?
3. When a PR exists, how long did it take from PR `createdAt` to `mergedAt`?
4. What bottleneck will we remove or shorten next time?

## Label contract

| Dimension | Labels | Rule |
|---|---|---|
| Contributors | `agent-codex`, `agent-grok`, `agent-Hermes`, ... | Preserve every contributor label after completion. Remove only `agent-lock`. |
| Issue duration | `cycle-under-15m` · `cycle-15m-1h` · `cycle-1h-4h` · `cycle-4h-1d` · `cycle-1d-3d` · `cycle-over-3d` | `startedAt` (fallback `createdAt`) to completion/verified merge. |
| PR duration | same buckets, prefix `pr-cycle-` | Live GitHub `createdAt` to `mergedAt`. Open or closed-unmerged PR fails closed (no label). |
| Outcome | `outcome-issue-closed` · `outcome-pr-merged` | Searchable closure truth. |
| Next optimization | `speed-next-auth` · `speed-next-ci` · `speed-next-handoff` · `speed-next-research` · `speed-next-reuse` · `speed-next-review` · `speed-next-scope` · `speed-next-tests` · `speed-next-tooling` · `speed-next-other` | Category only is searchable; exact experiment lives in the comment. |

Design constraint from the spec: use stable, low-cardinality labels for
filtering and exact values in one idempotent completion comment. Free-form
durations or improvement prose must not become one-off labels.

## Claim -> closeout workflow

1. Claim the issue through `tools/linear-agent-bridge.js`; this creates
   `agent-lock` and the first `agent-<name>` contributor label.
   ```bash
   node tools/linear-agent-bridge.js --claim AGENT-336 --agent hermes
   ```
2. Work the ticket in-tree. If another agent contributes materially, list it
   during closeout via `--agents a,b` (normalized, de-duplicated by the
   `agentList` helper in the bridge). Never replace earlier `agent-*` labels.
3. Close out with the exact command surface below. Preview first (reads only,
   zero writes); then repeat with `--apply`.
   ```bash
   node tools/linear-closeout-telemetry.js \
     --issue AGENT-336 \
     --agents codex,grok \
     --pr https://github.com/OWNER/REPO/pull/123 \
     --bottleneck "CI queue wait" \
     --improvement-category ci \
     --improvement "Run the focused gate before opening the PR and request CI once." \
     --evidence "https://github.com/OWNER/REPO/actions/runs/123" \
     --json --preview
   ```
   `--apply` (idempotent):
   - creates the missing stable labels above;
   - preserves unrelated labels and every `agent-*` contributor label;
   - validates the whole closeout, moves the issue to Done, and re-reads
     Linear's authoritative `completedAt` before calculating a no-PR
     issue duration;
   - posts one SHA-256-marked closeout comment, updating that same comment
     once if Linear's authoritative timestamp changes and reusing it on
     later retries;
   - removes `agent-lock` and stale telemetry labels;
   - moves the issue to the team's completed state;
   - writes the completion receipt into `AI-Agent-Sync/Handoffs/linear-claims/`.
4. Run the strict audit as the final coordination check (see below).

## Audit

```bash
node tools/linear-closeout-telemetry.js --audit --team AGENT --strict --json
```

`--strict` exits nonzero when any completed issue is missing a
contributor, cycle, outcome, or next-speed label. Historical issues before
the policy start are excluded unless `--since` is supplied.

## Hard rules

- Claim through the bridge before any closeout; `agent-lock` is the single
  agent at a time gate for this workflow.
- Use live Linear timestamps (`startedAt`/`completedAt`) and, when a PR
  exists, live merged-PR metadata. Never type a guessed duration.
- Name the observed bottleneck, not a generic aspiration.
- Write the next improvement as a testable process change: what will be done
  earlier, cached, automated, reused, or removed.
- Improvement prose goes in the closeout comment, not as a label.
- PAT stays in keychain `LINEAR_API_KEY`; never paste it into a PR or chat.

## Evidence / verification

- Reference policy: `docs/agents/linear-closeout-telemetry.md` (policed
  2026-08-09T15:10:00Z).
- Reference implementation + tests: `tools/linear-closeout-telemetry.js`,
  `tests/test-linear-closeout-telemetry.js` (fileset on PR #1585).
- PR #1585 `feat(coord): add Linear closeout telemetry` is OPEN and every
  check is SUCCESS (verified via `gh pr view 1585` 2026-08-09).
- Bridge helpers already in-tree and syntax-valid:
  `tools/linear-agent-bridge.js` — `agentList`, `parseDurationToSeconds`,
  `elapsedLabel`, `ensureTeamLabels` (confirmed via `node --check` and
  grep at lines 59 / 70 / 123 / 135).
- This skill is discoverable by the agent-loop skills loader:
  health check reports `Skills registered: 37` (this file is the 38th).
