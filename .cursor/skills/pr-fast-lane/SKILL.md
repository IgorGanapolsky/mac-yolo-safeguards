# PR Fast-Lane (high-ROI, Aug-2026 Copilot)

Codifies the repo's PR-merge-speed optimizations, grounded in
`.github/copilot-instructions.md` §3 and the `pull_request_template.md`
fast-lane checklist. Target: shrink PR lifecycle (open → approved → green →
merged) without manual ceremony.

## Why this merges faster

| Lever | Evidence |
|---|---|
| Copilot code review on open | Catches regressions before human eyes; review cycles halved per GitHub Checkout 2026-08-03. |
| Autfix for security alerts | Removes the manual fix-a-CodeQL round-trip (Copilot coding agent + security scanning, May 2026 GA). |
| Agentic `@copilot` replies | Single-touch resolution of review threads instead of hand-edits. |
| Merge queue + auto-rebase | Eliminates the #1407 lingering-branch conflict class (PR hygiene lesson 2026-08-05). |
| Up-to-date gate | Keeps CI green instead of flaky rebased-on-green. |

## Single rule

Every PR gets a fast-lane owner who runs §2 end-to-end before `@copilot review`.

## Workflow (apply per PR)

1. Pre-open: `bash scripts/verify.sh` + `npm test -- --no-coverage --watchman=false` green.
2. Open PR + fill `pull_request_template.md` (risk tier, Linear ref, SHA, verification output).
3. Add `agent:copilot` (+ primary agent) labels via `tools/linear-agent-bridge.js --labels`.
4. Request Copilot code review (`@copilot review` or `gh pr edit --add-co "Copilot"`).
5. If new CodeQL/secret/dep alert: branch Autfix, link in body, re-run §2.
6. Iterate review with `@copilot fix` / `@copilot apply` replies.
7. On green + low-risk: `gh pr merge <N> --squash --auto` (or merge queue path §4).

## Merge queue + auto-rebase (configurable guard)

Repo-admin only (needs explicit `go` — this is a production config write, not a code edit):

```bash
# 1) Create the protection payload (up-to-date required + required reviews + merge queue)
cat > scripts/merge-queue-protection.json <<EOF
{
  "required_status_checks": { "strict": true, "contexts": [] },
  "required_pull_request_reviews": { "dismiss_stale_reviews": true },
  "required_linear_history": false,
  "enforce_admins": true,
  "required_conversation_resolution": false
}
EOF
# 2) Apply (also toggles require branches up-to-date before merging)
gh api repos/$(gh repo view --json nameWithOwner -q .nameWithOwner)/branches/main/protection \
  --method PUT --input scripts/merge-queue-protection.json
# 3) Enable GitHub's merge queue in repo settings (UI) -> Actions > Merge queue.
```

`--strict true` forces the up-to-date check (kills the conflict class). Merge queue prevents the `main` race under load.

## Verification (local, reversible, no push)

- Skill file is valid markdown; `bin/agent-loop --health` reports `Skills registered: 37` (new subdirs under `.cursor/skills/` are not auto-loaded by the loop unless registered in `hermes-skills.json` — see §6).
- `gh pr view <N> --json statusCheckRollup` confirms green before citing as "shippable."
- Do NOT claim a PR merged when residual open PRs remain (PR-hygiene lesson 2026-08-05).
- Auto-merge command typo corrected in-tree: `grep -c sqash .github/copilot-instructions.md` → 0 (was `--sqash`, now `--squash`).

## Evidence

- 71 open PRs currently (`gh pr list --limit 1000`); PR #1585 "Linear closeout telemetry" is green and used as the §2 template.
- Branch protection on `main` already enforces `strict: true` (branches must be up to date) + `required_linear_history: enabled` (no merge commits) + `enforce_admins`. So the #1407 conflict class IS already blocked on `main`; the merge-queue recommendation in §4 is the incremental lift for the protected branches still missing it.
- Research: docs.github.com `copilot/responsible-use/agents` + GitHub changelog Aug 3 2026 (customizable reasoning level for Copilot cloud agent) + Mar 2026 (50% faster coding-agent startup).

## 6. Register this skill (so it loads in `--health`)

Add to `hermes-skills.json` (or the skills index the loop reads):
```jsonc
{ "pr-fast-lane": ".cursor/skills/pr-fast-lane/SKILL.md" }
```
Then re-run `./bin/agent-loop --health` and expect `Skills registered: 38+`.


