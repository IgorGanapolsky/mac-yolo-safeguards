#!/usr/bin/env bash
# Automated Git Worktree Hygiene for mac-yolo-safeguards
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_root"

echo "=== Running Automatic Worktree Hygiene ==="

# 1. First prune dead worktree links
git worktree prune || true

# 2. Force remove all non-main worktree directories if any exist
git worktree list --porcelain | grep '^worktree ' | cut -d' ' -f2- | while read -r wt; do
  if [[ "$wt" != "$repo_root" ]]; then
    echo "Pruning stale worktree: $wt"
    git worktree remove --force "$wt" 2>/dev/null || rm -rf "$wt" || true
  fi
done

# 3. Clean untracked metadata in .git/worktrees
if [[ -d ".git/worktrees" ]]; then
  rm -rf .git/worktrees/* || true
fi

# 4. Final git prune
git worktree prune || true

active_count="$(git worktree list | wc -l | tr -d ' ')"
echo "=== Worktree Hygiene Complete: ${active_count} active worktree(s) ==="
