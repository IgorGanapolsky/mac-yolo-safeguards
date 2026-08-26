---
name: gitbutler-fleet-safe
version: 1.0.0
description: Route GitButler safely across Igor's agent fleet. Use before GitButler setup/teardown/land, commits in a linked worktree, or protected PR merges. Selects GitButler only in an explicit single-owner clone, the official normal-Git exception in linked worktrees, and repo-native pr:manage/Trunk for protected merges.
---

# GitButler fleet-safe route

This is a system-specific collision wall, not a copy of GitButler's command manual. Read the installed official `but` skill for GitButler commands after this router selects `gitbutler-workspace`.

## Required preflight

Run the read-only receipt before any version-control write:

```bash
bin/gitbutler-route \
  --repo "$PWD" \
  --agent "$AGENT_ID" \
  --branch "$BRANCH_NAME" \
  --files "path/one,path/two" \
  --require-ready \
  --json
```

The receipt verifies the current branch, every requested file against an active `plan.md` owner, GitButler CLI/skill version, sanitized Cloud/forge/`gh` auth state, and repository topology. It is always a dry run and never mutates Git, GitButler, a PR, or a merge queue.

## Routing contract

| Receipt rail | Use | Never |
|---|---|---|
| `gitbutler-workspace` | Only an isolated clone with one worktree and explicit `--single-owner-clone`; then follow the official `but` skill | Assume one worktree proves sole ownership |
| `git-linked-worktree` | Worktree-local normal Git writes under GitButler's official linked-worktree exception | `but setup`, `but teardown`, `but land` |
| `git-isolated-worktree-required` | Leave the shared primary unchanged; create or use one owned linked worktree | Convert the primary to `gitbutler/workspace` |
| `blocked-*` | Stop and repair ownership/topology evidence | Retry setup or invent another write rail |

For a protected merge, run the same command with `--operation merge`. A ready ThumbGate receipt must select `npm-pr-manage-trunk` and `npm run pr:manage`. The router never executes that command. If Trunk is detected without the repository manager, or neither is detected, merge readiness is false. Never substitute `but land`, `--admin`, or a raw queue comment.

## Health

```bash
node tests/test-gitbutler-route.js
but --version
but skill check
```

Expected GitButler CLI and official skill version: `0.22.1`. Auth receipts expose account labels and booleans only; credential values and Keychain references are never printed.
