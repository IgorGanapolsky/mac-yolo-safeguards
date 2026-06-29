#!/usr/bin/env bash
# One-time setup: point git at the tracked .githooks/ dir.
# Run after cloning (and in each git worktree). No package.json changes required.
set -euo pipefail
ROOT="$(git rev-parse --show-toplevel)"
git -C "$ROOT" config core.hooksPath .githooks
chmod +x "$ROOT/.githooks/"* 2>/dev/null || true
echo "✓ git hooks enabled (core.hooksPath=.githooks). Pre-commit will typecheck + test staged hermes-mobile changes."
