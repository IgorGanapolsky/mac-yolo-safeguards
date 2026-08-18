#!/usr/bin/env bash
# One-time setup: point git at the tracked .githooks/ dir.
# Run after cloning (and in each git worktree). No package.json changes required.
#
# NEVER write an absolute hooksPath. Relative `.githooks` is the Husky
# mechanic (https://typicode.github.io/husky/) without the npm package:
# each worktree resolves hooks against its own checkout. An absolute path
# pointing at the primary tree makes every worktree run the primary hook.
set -euo pipefail
ROOT="$(git rev-parse --show-toplevel)"
# Force the exact relative token. Do not expand ROOT into the value.
git -C "$ROOT" config core.hooksPath .githooks
hooks_path="$(git -C "$ROOT" config --get core.hooksPath || true)"
if [[ "$hooks_path" != ".githooks" ]]; then
  echo "ERROR: core.hooksPath must be relative .githooks (got: ${hooks_path:-empty})" >&2
  exit 1
fi
chmod +x "$ROOT/.githooks/"* 2>/dev/null || true
echo "✓ git hooks enabled (core.hooksPath=.githooks). Pre-commit will typecheck + test staged hermes-mobile changes."
