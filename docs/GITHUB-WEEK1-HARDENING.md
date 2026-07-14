# GitHub Week 1 hardening (stay on GitHub — no GitLab migration)

Follow-up to the July 2026 GitLab migration research. Decision: **stay on GitHub**; harden merge throughput and Mac-mini CI capacity first.

## Status (2026-07-14)

| Item | Status | Evidence |
|------|--------|----------|
| `merge_group` on `ci.yml` | **Shipped** | PR branch |
| `merge_group` on `mobile-e2e.yml` | **Shipped** | PR branch |
| `merge_group` on `mobile-continuous.yml` | **Shipped** | PR branch |
| Merge queue on `main` | **Blocked** | See below |
| Mac mini self-hosted runner | **Online** | `mac-mini-hermes` @ `100.94.135.78`; labels `macos-arm64`, `hermes-e2e`; `gh api …/actions/runners` → `status: online` (2026-07-14T03:58Z) |
| `macOS guard kit` on Mac mini | **Shipped** | `ci.yml` → `[self-hosted, macos-arm64, hermes-e2e]` when `mac-mini-hermes` online; else `macos-latest` |

## Merge queue — blocked on personal Free plan

Attempted via `gh api` (REST rulesets + GraphQL `createRepositoryRuleset`) on `IgorGanapolsky/mac-yolo-safeguards`:

- REST `POST .../rulesets` with `"type": "merge_queue"` → `422 Invalid rule 'merge_queue'`
- GraphQL `createRepositoryRuleset` with `MERGE_QUEUE` → `UNPROCESSABLE Invalid rules: 'Merge queue'`
- Classic branch protection REST update with `merge_queue_enabled` → not supported on legacy endpoint

**Root cause:** GitHub merge queue is available for **GitHub Team / Enterprise** and for **public repos owned by organizations** on GitHub Free. This repo is a **personal-account public repo** on the default Free plan — the API rejects the merge-queue rule type.

**Unblock options (pick one):**

1. Move the repo to a GitHub **organization** (Free org + public repo → merge queue allowed), then run `bash scripts/enable-github-merge-queue.sh`.
2. Upgrade the account or org to **GitHub Team**, then run the same script.
3. Enable manually in the UI after upgrading: **Settings → Branches → `main` → Require merge queue** (build concurrency **5**, squash merge, HEADGREEN).

Until merge queue is enabled, `merge_group` triggers are **harmless no-ops** — they prepare CI for the day the rule is turned on.

### Recommended merge-queue settings (when unblocked)

| Setting | Value | Why |
|---------|-------|-----|
| Build concurrency | 5 | Matches research target; parallel `merge_group` without replaying the 2026-07-10 global-cancel crisis |
| Grouping | HEADGREEN | Head commit of the merge group satisfies required checks |
| Merge method | Squash | Matches linear history on `main` |
| Min / max group | 1 / 1 | One PR per merge; avoids batched deploy risk |

## 2026-07-10 cancelled-run crisis (do not regress)

`mobile-e2e.yml` documents the incident: a **global** concurrency group caused GitHub to cancel queued runs when new pushes arrived — 18/20 runs ended `cancelled`, stranding required checks.

**Guards now in place:**

- Per-ref concurrency: `hermes-mobile-maestro-ship-guard-${{ github.ref }}` and `ci-${{ github.workflow }}-${{ github.ref }}`
- `push` scoped to `main` only (PR branches rely on `pull_request` + `merge_group`)
- Do **not** reintroduce a repo-wide concurrency group for emulator jobs

**Merge queue note:** temporary branches use the `gh-readonly-queue/{base}/…` prefix. Workflows that listen only to `push:` (not `merge_group`) may double-run or miss checks. Required workflows in this repo now include `merge_group:`.

## Mac mini self-hosted runner

See [GITHUB-MAC-MINI-RUNNER.md](./GITHUB-MAC-MINI-RUNNER.md).

Target host: Mac mini on Tailscale (`100.94.135.78`, 24 GB). Intended labels: `self-hosted`, `macOS`, `macos-arm64`, `mac-mini`, `hermes-e2e`.

**Registered 2026-07-14:** runner `mac-mini-hermes` is **online** on `IgorGanapolsky/mac-yolo-safeguards`. LaunchAgent `com.igor.github-actions-runner` (KeepAlive) under `igorganapolsky@100.94.135.78`. Replaced stale `resume-ci-mac` config that pointed at `IgorGanapolsky/Resume`.

**CI routing:** `macos-guard-runner-pick` probes runner status each workflow run. When `mac-mini-hermes` is online, `macOS guard kit` uses `runs-on: [self-hosted, macos-arm64, hermes-e2e]` to reduce GitHub-hosted macOS queue starvation; otherwise it falls back to `macos-latest`. Fork PRs always use GitHub-hosted runners.

Register (or re-register):

```bash
# On Mac mini (or via SSH — default HERMES_MINI_SSH_USER=igorganapolsky, not igor@)
bash scripts/register-github-mac-mini-runner.sh --remote
```

Verify:

```bash
gh api repos/IgorGanapolsky/mac-yolo-safeguards/actions/runners \
  --jq '.runners[] | {name, status, labels: [.labels[].name]}'
```

## Week 2+ (optional, not in scope)

- GitLab CI mirror pilot — **not started** (per research recommendation)
- Filter `gh-readonly-queue/**` on any future Copilot/setup workflows that use unscoped `push:`

## Related

- GitLab migration research verdict: stay GitHub; merge queue + Mac-mini runner first
- Branch protection required checks: `macOS guard kit`, `Hermes Mobile typecheck and tests`, `Maestro ship-guard (Android emulator)`, `Public funnel checks`, `Socket Security: Project Report`
