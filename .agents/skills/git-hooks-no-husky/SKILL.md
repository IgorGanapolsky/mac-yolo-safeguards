---
name: git-hooks-no-husky
description: >
  Husky process steal without the npm package. Keep core.hooksPath=.githooks
  (relative) so each worktree runs its own hook. Do not install husky.
  Trigger: husky, typicode.github.io/husky, hooksPath, worktree hooks, would
  husky help. Slash: /git-hooks-no-husky.
---

# Git hooks without Husky

Source: [typicode.github.io/husky](https://typicode.github.io/husky/) (2026-08-18).
Not affiliated. **Do not `npm i husky`.**

This repo already has the product: tracked `.githooks/pre-commit` +
`scripts/install-git-hooks.sh` (T-37 ownership + worktree test gate).

## What we steal

| Husky | Here |
|-------|------|
| Relative `core.hooksPath` (`.husky/_`) | Relative `.githooks` so each worktree runs **its** hook |
| `prepare` auto-install | `scripts/install-git-hooks.sh` + `bin/hooks-path-doctor --heal` |
| Tiny hook wrapper | Existing `.githooks/pre-commit` — do not rewrite |

## What we do not steal

The husky npm package, `.husky/`, `HUSKY=0` as a new env, or lint-staged.

Absolute `core.hooksPath` pointing at the primary checkout makes every
worktree run the dirty shared tree's hook. That is the bug this skill
exists to prevent.

## Run

```bash
node tools/hooks-path-doctor.js --json
node tools/hooks-path-doctor.js --heal
scripts/install-git-hooks.sh
```

## NEVER / ALWAYS

| NEVER | ALWAYS |
|-------|--------|
| `npm i husky` / `--add-husky` | Keep `.githooks` |
| Store an absolute hooksPath | Relative `.githooks` |
| Edit another agent's `.githooks/pre-commit` claim | Doctor + installer only |

## Related

- `/high-roi-steal-and-finish` · `/ci-first-fail`
