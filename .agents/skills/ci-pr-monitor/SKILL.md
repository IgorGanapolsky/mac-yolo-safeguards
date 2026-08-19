---
name: ci-pr-monitor
description: Repeatable workflow for monitoring CI check status, tracking PR merge-readiness, and verifying auto-merge success using the gh CLI.
version: 1
owner: claude-code
license: MIT
trigger:
  - "CI not green"
  - "PR checks"
  - "PR status"
  - "is the PR ready to merge"
  - "merge check"
  - "CI red"
  - "auto-merge"
health_check: "gh pr checks returns all required contexts pass"
---

# CI-PR Monitor Skill

Use this skill whenever you need to verify GitHub Actions CI check status,
track PR merge-readiness, or confirm auto-merge success.

## Quick Commands

| Action | Command |
|--------|---------|
| List all checks for a PR | `gh pr checks <PR_NUM>` |
| JSON status of a PR | `gh pr view <PR_NUM> --json state,mergeable,mergeStateStatus` |
| Get required status contexts | `gh api repos/<owner>/<repo>/branches/<branch>/protection --jq '.required_status_checks.contexts[]'` |
| Enable auto-merge (squash) | `gh pr merge <PR_NUM> --auto --squash` |
| Wait for a specific check | `gh pr checks <PR_NUM> --watch` |
| Get workflow runs for a branch | `gh api repos/<owner>/<repo>/actions/workflows/<workflow>/runs --jq '[.workflow_runs[] \| select(.head_branch=="<branch>")]'` |

## Decision Flow

1. **Check current status:** `gh pr checks <PR> --json name,state,conclusion`
2. **Classify results:**
   - `pass` / `SUCCESS` → check is green
   - `pending` → still running, wait
   - `fail` / `FAILURE` → investigate the failing step
   - `skipping` → not applicable to this change
3. **Required checks only:** Compare against the protected-branch required contexts.
   Non-required checks (e.g., macOS runners, mobile E2E) that remain pending
   should NOT block merge if all required checks are green.
4. **Auto-merge:** If `mergeable: MERGEABLE` and `mergeStateStatus: CLEAN`,
   run `gh pr merge <PR> --auto --squash`. GitHub will queue the merge for
   when all required checks clear.

## Notes

- The `mergeStateStatus` field returns `UNKNOWN` once the PR is merged.
  If `state: "MERGED"`, the PR is already in `main`.
- Cloudflare/GitHub Actions queue storms: check GitHub Status API
  (<https://www.githubstatus.com/api/v2/summary.json>) before blaming
  code or runners if checks are missing (not failing).
- Never `gh run rerun` a queued run — it's a no-op.
- Auto-merge via `--auto` requires the `pull-requests: write` permission.
