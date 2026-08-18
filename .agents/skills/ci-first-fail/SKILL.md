---
name: ci-first-fail
description: >
  Buildkite-style first-fail CI annotations. Name the failing STEP before
  reading logs. Missing required contexts → GitHub Status, not a code blame.
  Do not migrate this public repo off GitHub Actions. Trigger: red CI, BLOCKED
  PR wall, "is it the runner", first failing step, Buildkite. Slash: /ci-first-fail.
---

# CI first-fail (Buildkite process steal)

Source: [buildkite.com/home](https://buildkite.com/home/) (2026-08-18).
Not affiliated. **Do not switch vendors.**

Buildkite's own comparison: stay on GitHub Actions when repos are public and
CI is not costing time or money. This repo is public; required checks are 7
GHA contexts on `ubuntu-latest`.

## What we steal

| Buildkite | Here |
|-----------|------|
| Step-level visibility / annotations | `bin/ci-first-fail --pr N` names the first failed step |
| Token-optimized pipeline reads | `gh run view --json jobs` only — never `--log-failed` |
| Test identity | first TAP `not ok` from check **annotations**, not logs |
| Missing vs failing | absent required → `githubstatus.com` JSON, not a code blame |

## What we do not steal

Pipelines SaaS, Test Engine auto-quarantine, Package Registries, Mobile
Delivery Cloud, MCP server, hosted Mac agents, or a second CI bill.
Auto-quarantine on first fail hides real regressions (`--quarantine` refused).

## Run

```bash
node tools/ci-first-fail.js --pr 1819 --json
bin/ci-first-fail --fixture tests/fixtures/ci-first-fail.json
```

Then run the failing step's command locally. Complements `/diagnose-ci-failure-fast`
(still reproduce on `origin/main` before claiming your regression).

## NEVER / ALWAYS

| NEVER | ALWAYS |
|-------|--------|
| Migrate this repo to Buildkite | Keep the 7 GHA required contexts |
| Dump job logs first | Print `first_step` |
| Blame code when required contexts are *absent* | Check githubstatus.com |
| `gh run rerun` a queued run | Wait for Actions to drain |
