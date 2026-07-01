# Hermes Loop State

`tools/hermes-loop-state.js` turns each agent pass into a resumable packet:

- `plan.md` task state
- git branch, commit, and dirty files
- `hermes-mobile/docs/proofs/continuous/latest.json`
- quality gates for unit, continuous E2E, worktree state, and active tasks
- the next bounded action, with evidence and a verifier command

This is the high-ROI part of CodeRabbit-style loop engineering for this repo:
durable state plus external gates. It does not create an autonomous merger, spend
money, change provider state, or bypass the plan ownership rules.

## Commands

Preview without writing:

```bash
node tools/hermes-loop-state.js --json --no-write
```

Write the latest JSON and Markdown packets:

```bash
node tools/hermes-loop-state.js --json
```

Default outputs:

- `artifacts/hermes-loop-state/latest.json`
- `artifacts/hermes-loop-state/latest.md`

The artifact directory is gitignored. The packet is for humans and follow-on
agents to resume from evidence rather than re-running broad diagnosis.

## Gate Semantics

| Gate | Pass condition |
| --- | --- |
| `unit` | latest continuous proof has `unit=pass` |
| `continuous_e2e` | latest continuous proof has `e2e=pass` |
| `worktree` | git status has zero dirty entries |
| `active_plan_tasks` | no `in_progress` or `blocked` plan rows |

`readyToMergeOrPublish` is true only when every hard gate is green, the worktree
is clean, and no active/blocked plan tasks remain.

## Why This Helps

CodeRabbit's loop engineering pattern works when each run has:

1. stable work ownership,
2. a durable state file,
3. independent verification gates,
4. a small next action that the following agent can execute.

Hermes already has `plan.md`, git worktrees, and continuous E2E. This tool closes
the missing state-file gap so a fresh agent can see that, for example,
`unit=pass` while `e2e=fail`, which flow failed, which tasks are still active,
and what exact evidence to inspect next.
