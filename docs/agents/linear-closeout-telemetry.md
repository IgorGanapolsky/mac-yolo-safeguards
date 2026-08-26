# Linear closeout evidence

**Status:** the earlier cycle-time telemetry design is not implemented on current `main`. `tools/linear-closeout-telemetry.js` is absent, so agents must not cite its preview, labels, audit, or idempotent-comment behavior as available.

## Implemented closeout

Close an issue only after the PR is actually merged and exact-head CI is verified:

```bash
node tools/linear-agent-bridge.js --done <ISSUE_ID> \
  --agent <AGENT_NAME> \
  --comment "<PR_URL> <MERGE_SHA> <CI_URL>; bottleneck=<OBSERVED>; next=<TESTABLE_CHANGE>" \
  --json
```

Then re-read Linear and the returned vault receipt. Verify:

- state is `Done`;
- human owner remains the assignee;
- agent attribution label is preserved;
- the evidence comment contains the PR URL, merge SHA, and exact-head CI URL;
- the Obsidian receipt exists under `Handoffs/linear-claims/`.

The current bridge does not compute cycle time, PR duration buckets, outcome labels, or a strict historical audit. Do not type guessed durations or claim those features exist.

## Read-only workspace audit

Use the implemented hygiene command for provider counts and stale-candidate review:

```bash
node tools/linear-workspace-hygiene.js --dry-run --stale-days 90 --json
```

That command has no mutation mode. See [linear-obsidian-coordination.md](./linear-obsidian-coordination.md) and [the project skill](../../.agents/skills/linear-agent-skills/SKILL.md).
