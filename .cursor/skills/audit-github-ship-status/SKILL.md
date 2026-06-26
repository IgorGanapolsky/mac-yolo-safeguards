---
name: audit-github-ship-status
description: Audits mac-yolo-safeguards GitHub ship readiness — pushed commits, open/stale PRs, CI workflow conclusions, Dependabot alerts. Use when user asks if everything is merged, CI passed, pushed, or security-clean. Evidence-only; no ship theater.
---

# Audit GitHub ship status (mac-yolo-safeguards)

## When to invoke

- "Everything pushed/merged/CI passed?"
- "Any stale PRs?"
- "GH security issues?"
- Before opening or merging a Hermes Mobile PR

## Commands (parallel OK)

```bash
git fetch origin
git status
git branch -vv
git log origin/main..HEAD --oneline
git log HEAD..origin/main --oneline

gh auth status
gh pr list --state open
gh pr list --state merged --limit 5
gh run list --limit 10
gh run list --branch "$(git branch --show-current)" --workflow CI
gh api repos/IgorGanapolsky/mac-yolo-safeguards/dependabot/alerts --jq '[.[] | select(.state=="open")] | length'
```

## Interpretation

| Question | Green only if |
|----------|----------------|
| Pushed? | `HEAD` = `origin/<branch>` **and** user cares about uncommitted work (`git status` clean if claiming "all work pushed") |
| Merged to main? | `origin/main..HEAD` empty **or** open PR merged |
| CI passed? | Latest relevant `gh run` **success** for the branch/workflow in question — check **Store Release** vs **Internal Distribution** separately |
| Stale PRs? | `gh pr list --state open` reviewed for age |
| Security clean? | Open Dependabot count = 0 (or listed with severities) |

## mac-yolo-safeguards specifics

- Long-lived branch `agent/gemini/tmobile-antenna-fix` often **42+ commits ahead of main** with **no open PR**.
- Large uncommitted tree (`.thumbgate/`, `hermes-mobile/`, `tools/`) is normal — count M + `??` lines.
- `main` CI can be green while feature branch never ran **CI** workflow.
- Code scanning may 404 if not enabled — note access, don't assume clean.

## Red flags from 2026-06-24 session

1. Uncommitted local work not on remote
2. Feature branch not merged; zero open PRs
3. Store Release workflow failure while Internal Distribution succeeds
4. 3 open Dependabot alerts (medium: js-yaml, @opentelemetry/core, uuid)
5. Agent claimed E2E without `latest.json`

## Output template

```markdown
## Ship audit — <branch> @ <sha>

| Check | Answer | Evidence |
|-------|--------|----------|
| Branch synced to remote | | git branch -vv |
| Commits ahead of main | | git log origin/main..HEAD --oneline \| wc -l |
| Uncommitted paths | | git status |
| Open PRs | | gh pr list |
| CI (main) | | run URL + conclusion |
| CI (branch) | | run URL or "none" |
| Dependabot open | | count + packages |

**Everything clean?** YES/NO — one-line reason.
```

## Do not

- Commit/push/merge unless user explicitly asks
- Say "all green" when only `main` CI is green and work is on a feature branch
- Ignore uncommitted files when user asked about "everything pushed"
