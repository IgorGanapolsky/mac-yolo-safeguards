# Shipping, dependency & PR hygiene — full detail

> Extracted verbatim from `AGENTS.md` on 2026-07-29 to keep the always-injected core small.

## Always ship finished work (commit → push → merge)

**User directive (2026-07-12, emphatic):** never leave verified work uncommitted — "you must always commit and push, and merge PRs."

1. When a change is tested and verified, **commit it the same session**: own branch off `origin/main`, in an **isolated worktree** (never `git checkout -b` in a shared working tree — it hijacks whatever branch a live agent has checked out there).
2. Stage **only your own files** — other agents' dirty WIP must never ride along.
3. Push, open a PR, watch CI, and **merge when green** (`--auto` on strict-protection repos); report the merge with commit SHA + CI status.
4. Uncommitted work on this multi-agent repo evaporates — another agent's checkout/revert can silently destroy it within hours. Untracked finished work is indistinguishable from no work.

## Dependency & PR hygiene (added 2026-07-07 after the Dependabot triage)

- **Greptile AI PR review (2026-07-15).** Config lives in [`.greptile/`](../../.greptile/) + [`hermes-mobile/.greptile/`](../../hermes-mobile/.greptile/) (cascading; `.greptile/` beats legacy `greptile.json`). Agents must read Greptile comments as required context on connect/onboarding/auth/OTA PRs before ship claims — see [hermes-mobile/docs/GREPTILE-CODE-REVIEW.md](../../hermes-mobile/docs/GREPTILE-CODE-REVIEW.md). Focus rules: fresh-user onboarding, Tailscale/USB, no `demo=1` false greens, Expo OTA vs native, multi-Mac API keys. Trigger: `@greptileai review` after the [Greptile GitHub App](https://github.com/apps/greptile) is installed on this repo. Skip with label `greptile-skip` / `docs-only`.
- **Expo SDK pins are law.** `react-native`, `react`, `expo`, `expo-*` versions are set by the Expo SDK (currently 55) and move ONLY via `npx expo install --fix` during a deliberate SDK upgrade. Never merge a standalone bump of these; `.github/dependabot.yml` ignores them — keep those rules.
- **Dependabot auto-merge policy:** semver-minor/patch with green checks auto-merge (`.github/workflows/dependabot-automerge.yml`). Semver-major requires an agent to (1) check API compatibility of the actual call sites, (2) update any tests that hardcode versions (e.g. `internalDistributionWorkflow.test.ts` asserts workflow action versions), (3) merge manually.
- **Security alerts never sit.** A daily cloud sentinel (`mac-yolo repo sentinel`, claude.ai/code/routines) triages alerts + PR health at 8am ET and reports via ntfy. If an alert can't be fixed (transitive, parent pins vulnerable range), dismiss ONLY with file:line evidence that the vulnerable path is unreachable (≤280-char comment). Precedent: alert #2, 2026-07-07.
- **One automation owner per job.** Before adding a watcher/daemon for repo automation, check this section + open PRs for an existing owner — duplicate automations have already collided (a watcher-created `security/dependabot-autofix-*` branch raced the sentinel on 2026-07-07).
- **Don't close/rebase/fix another agent's PR.** Report blockers (conflicts, failing checks) instead. Exception: dependabot[bot] PRs are ownerless — any agent may fix or close them with a reason.
- **Merge only when required checks are green** (main is `strict: true`): `Public funnel checks`, `Socket Security: Project Report`, `Hermes Mobile typecheck and tests`, `Maestro ship-guard (Android emulator)`, `macOS guard kit`. Prefer `gh pr merge --auto --squash` over force-merging.
- **Chat-pasted GitHub PATs are leaks.** Never store or use them; use keyring `gh` only (`gh auth status`). Flag rotation in the same turn.
- **Squash merges do not make branch tips ancestors of main.** Delete leftover remote branches via merged-PR heads (`gh pr list --state merged`), not `git merge-base --is-ancestor`.
- **Do not bulk-delete multi-agent worktrees** (~100+ under `/private/tmp/codex-*`, `.worktrees/`). Only prune branches of *merged* PRs and clearly agent-owned disposable trees you created.
- **CI queue storm:** when macOS/Maestro jobs pile up, cancel in-progress/queued runs on already **MERGED/CLOSED** PR heads to free runners — never cancel another agent's open-PR CI.

## GitHub Code Quality guardrails (Hermes Mobile)

GitHub Code Quality is **paid** (~$10/active committer/month + metered AI). This public personal-account repo may return **404** on `GET /repos/{owner}/{repo}/code-quality/setup` until a Team/Enterprise plan enables it — CI still uploads Cobertura (`hermes-mobile/coverage/cobertura-coverage.xml`) as a prerequisite.

Agents: run `node tools/github-code-quality-status.js` before enable/disable decisions. Prefer **evaluate** coverage rulesets (`.github/code-quality-coverage-ruleset.evaluate.json`) before **active** enforcement. Do **not** enable org-wide scanning or leave Code Quality on when unused. Disable via `PATCH .../code-quality/setup` with `state=not-configured` when the product is not delivering value. Detail: [docs/CURSOR-AUTOMATIONS.md](../CURSOR-AUTOMATIONS.md#github-code-quality-hermes-mobile-evaluate-first).

## Public GitHub Issues board (2026-07-13)

This repo is **public**. The Issues UI is for **public-safe product intake only**:

| Allowed on Issues | Not allowed |
|-------------------|-------------|
| Free incident report template | Internal engineering backlog (G-ids, architecture extracts) |
| Paid hardening inquiry template | Agent coordination, file locks, WIP |
| Product bugs with public-safe repro | Secrets, gateway URLs, API keys, PATs, customer names |

**Agent engineering backlog** lives in:

- [`plan.md`](../../plan.md) — live multi-agent claims
- [`hermes-mobile/docs/JULY-2026-STANDARDS-GAP-BACKLOG.md`](../../hermes-mobile/docs/JULY-2026-STANDARDS-GAP-BACKLOG.md) — standards gap AC

Do **not** bulk-create internal tech-debt epics as public Issues. Labels (`priority:*`, `handoff:*`) may exist for the few product issues; they do not justify dumping the agent board onto Issues.

## Code scanning (CodeQL) — do not re-accumulate debt

Offline gate: `node tools/codeql-pattern-gate.js` (CI Public funnel + pre-commit). Live budget: `node tools/codeql-alert-sync.js --gate`. Shared helpers under `tools/lib/` (`asc-jwt-es256`, `safe-url-host`, `safe-html-strip`, `safe-exec`). Full playbook: [docs/CODEQL-SECURITY-BURN-DOWN.md](../CODEQL-SECURITY-BURN-DOWN.md).

### AI orchestration (required)

```bash
node tools/codeql-agent-hygiene.js --session-start   # open_on_main brief
node tools/codeql-agent-hygiene.js --pre-ship        # before security PRs
node tools/codeql-agent-hygiene.js --claim "security clean"
```

Agents must not claim Security tab clean without live `gh` open count on **main**. Full: [codeql-orchestration.md](./codeql-orchestration.md).

## PR merge hygiene (2026-08-12)

- Required contexts (strict + enforce_admins): Public funnel checks, Socket Security, Hermes Mobile typecheck and tests, macOS guard kit, Maestro ship-guard, Maestro stranger cold-start, Hermes Mobile iPad simulator gate.
- **Unresolved review threads block merge even when all 7 required checks are green** (seen on #1688).
- `gh pr update-branch` under `strict:true` restarts the matrix — wait for re-green before claiming merge-ready.
- Prefer `gh pr merge --auto --squash`. Close theater/superseded PRs with explicit successor PR SHA.
- **Never say "Done merging PRs"** unless `gh pr view --json state,mergeCommit` shows `MERGED` plus a merge SHA. Auto-merge armed is not merged. A wall of `BLOCKED` PRs with GitHub Actions operational is usually a required check red on `origin/main`, not a missing-context outage.
- **Calendar-dated required Jest is a merge-queue outage.** Freeze-path tests must pin `Date.now` (or pass `nowMs`) inside `OTA_BILLING_FREEZE_UNTIL_MS`. Do not kick the floor date as the only fix. Issue #1751 (2026-08-15): three Expo billing-freeze tests failed on `main` after `2026-08-15T00:00Z` and blocked every PR.

## PR hygiene session pattern (2026-08-17)

Fleet triage order (evidence-first):

1. **Inventory** open PRs per repo with `mergeable` + `mergeStateStatus` + check rollup (REST if GraphQL 504 on large repos).
2. **Merge only** non-draft `MERGEABLE` + required checks green (or admin when own-PR review is the sole gate and checks are green).
3. **Product CONFLICTING** PRs: comment + leave open for rebase; do **not** mass-close.
4. **Duplicate bot/analytics CONFLICTING** PRs: close with reason (keep history).
5. **Worktrees**: remove only branches with a **merged** PR; never touch open-PR heads.
6. **Proof**: every merge claim needs `mergeCommit.oid` + post-merge CI link; withhold “Done merging PRs. CI passing…” until tip CI is SUCCESS.

Cross-repo: ThumbGate uses Trunk + strict checks; ai-operations-agency needs 1 review; hermes-mobile main may be unprotected — still require green checks before squash.
