---
name: oss-engagement-tinker-poolside-lancedb
description: >
  Repeatable procedure for the recurring "OSS engagement — Tinker / Poolside / LanceDB"
  scheduled trigger (trig_01BbBT72qc9eA2DLne4PA79Y): survey thinking-machines-lab/tinker,
  thinking-machines-lab/tinker-cookbook, poolsideai/pool, lancedb/lancedb, and lancedb/lance
  for genuine contribution opportunities, fix + test + PR at most one issue per org, log to
  coordination/oss-engagement-log.md. Trigger when running or debugging this scheduled task,
  or when asked to re-verify its GitHub access. Read the "Known blocker" section FIRST —
  it explains a session-scope wall that has blocked every run so far and exactly what fixes it.
---

# OSS engagement: Tinker / Poolside AI / LanceDB

## Known blocker (check this before doing anything else)

As of 2026-08-03, **every run of this trigger has been unable to open a PR or post a
comment in any of the three target orgs.** This was verified exhaustively (see
`coordination/oss-engagement-log.md`, 2026-08-03 entry) — it is not a missing-tool
problem:

- The Claude Code Remote session this trigger fires into is hard-scoped to
  `igorganapolsky/mac-yolo-safeguards` only (plus, after a manual `add_repo`, the
  existing `igorganapolsky/lancedb` fork — which is still useless as a PR base
  because the *upstream* `lancedb/lancedb` remains out of scope).
- `add_repo` for any `thinking-machines-lab/*` or `poolsideai/*` repo fails with
  "cross-tier adds are not supported in v1 ... add a repo from the same owner as
  the existing sources."
- Installing `gh` CLI and authenticating with the real `GITHUB_TOKEN`/`GH_TOKEN` does
  **not** help — `gh api repos/<org>/<repo>/...` for any out-of-scope repo returns the
  identical proxy error as the MCP tools: `"GitHub access to this repository is not
  enabled for this session."` The block is enforced at the session's network/API
  proxy layer, not just by the `mcp__github__*` tool surface, so no client-side tool
  substitution routes around it.
- `mcp__github__fork_repository` against an out-of-scope source repo is denied for
  the same reason, so a fresh fork can't be created for Tinker or Poolside from
  inside this session either.

**The actual fix has to happen outside any tool this session can call** — at
session/trigger-creation time, by giving the trigger's session_context multiple
`sources` (or by running from a session whose *initial* source is one of the target
repos; the error message's suggestion is literally "start a new session with the
requested repo as the initial source"). Concretely, one of:
1. Recreate this trigger via the Claude Code web/app UI with additional git sources
   attached: `thinking-machines-lab/tinker-cookbook`, `thinking-machines-lab/tinker`,
   `poolsideai/pool`, `lancedb/lancedb`, `lancedb/lance`.
2. Or split into separate triggers, each fired into a session whose primary/initial
   source is one of those repos.
3. Pre-create forks under `IgorGanapolsky` for `tinker-cookbook`, `tinker`, and `pool`
   (a `lancedb` fork already exists at `IgorGanapolsky/lancedb`) from a session that
   *does* have source access to those orgs, so a future correctly-scoped session has
   something to push to immediately.

If you land in this skill and the blocker above is still present, don't re-derive it —
re-verify quickly (one `add_repo` attempt, one out-of-scope `list_issues` or `gh api`
call) and log the outcome. If it's fixed, proceed to the workflow below.

## Session bootstrap (every run)

`gh` CLI installs and authenticates automatically via `.claude/hooks/session-start.sh`
(SessionStart hook, registered in `.claude/settings.json`). Confirm with:

```bash
gh auth status || true   # may show "invalid" even when gh api calls work — check gh api user
gh api user
```

## Workflow (once GitHub access to the target orgs is actually available)

1. **Survey** each repo's open issues from the last 48h, plus `good-first-issue` /
   `help-wanted` / `bug` labels and unanswered discussions:
   ```bash
   gh issue list --repo thinking-machines-lab/tinker-cookbook --state open --limit 30
   gh issue list --repo poolsideai/pool --state open --limit 30
   gh issue list --repo lancedb/lancedb --search "label:\"good first issue\"" --state open
   ```
2. **Pick at most one issue per org** you can genuinely fix — prefer reproducible bugs,
   docs gaps, test gaps, error-handling holes. Never a typo/whitespace/README-only fix.
3. **Clone and fix for real**: `git clone` the repo, write the fix AND a regression test
   that fails before / passes after, run the project's own test suite. Do not open a PR
   unless the tests actually pass.
4. **Fork + PR from Igor's fork**: `gh repo fork <org>/<repo> --clone=false` if no fork
   exists yet, push the branch to `IgorGanapolsky/<repo>`, then
   `gh pr create --repo <org>/<repo> --head IgorGanapolsky:<branch> --base main`.
   PR body must describe the failure concretely, show before/after, state how it was
   verified. No ThumbGate mentions in third-party PRs, ever.
5. **Answer questions** in issues/discussions with specific technical content where you
   can genuinely help — never a generic "great question" reply.
6. **Log**: append a dated entry to `coordination/oss-engagement-log.md` — repos
   surveyed, issues considered, what was opened (URLs), what was answered, what was
   deliberately skipped and why. Then commit to a branch and open a draft PR against
   `main` in `mac-yolo-safeguards` (that repo is always in scope).

## Hard rules (unchanged from the trigger's own prompt)

- Max 1 PR per organization per run.
- Never a PR whose purpose is to mention ThumbGate; ThumbGate may come up in a comment
  only as a direct, genuine answer to something someone actually asked, at most once
  per run across all three communities.
- If nothing defensible is found, open nothing — that's a success, not a failure.
- Never fabricate test results or verification.
