#!/usr/bin/env bash
# Non-destructive Git worktree hygiene for mac-yolo-safeguards.
#
# The hourly job is deliberately audit-only for existing directories. Git may
# prune metadata for a worktree whose directory is already missing, but this
# script never removes a worktree directory or its registration. Deleting an
# existing worktree requires separate proof that it is clean, inactive, old,
# and represented by a merged PR.
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --repo)
      [[ $# -ge 2 ]] || {
        echo "missing value for --repo" >&2
        exit 64
      }
      repo_root="$2"
      shift 2
      ;;
    *)
      echo "unknown argument: $1" >&2
      exit 64
      ;;
  esac
done

repo_root="$(cd "$repo_root" && pwd)"
git -C "$repo_root" rev-parse --git-dir >/dev/null
git_common_dir="$(git -C "$repo_root" rev-parse --path-format=absolute --git-common-dir)"
primary_worktree="$(cd "$(dirname "$git_common_dir")" && pwd)"

before_count="$(git -C "$repo_root" worktree list --porcelain | grep -c '^worktree ' || true)"

# Safe operation: this removes registrations only when their directories are
# already gone. It does not touch any existing clean or dirty worktree.
git -C "$repo_root" worktree prune --expire now

after_count="$(git -C "$repo_root" worktree list --porcelain | grep -c '^worktree ' || true)"
dirty_count=0
existing_secondary_count=0

while IFS= read -r worktree_path; do
  [[ -n "$worktree_path" ]] || continue
  resolved_path="$(cd "$worktree_path" 2>/dev/null && pwd || true)"
  [[ -n "$resolved_path" && "$resolved_path" != "$primary_worktree" ]] || continue
  existing_secondary_count=$((existing_secondary_count + 1))
  if [[ -n "$(git -C "$resolved_path" status --porcelain --untracked-files=normal)" ]]; then
    dirty_count=$((dirty_count + 1))
  fi
done < <(git -C "$repo_root" worktree list --porcelain | sed -n 's/^worktree //p')

pruned_missing_count=$((before_count - after_count))
if [[ "$pruned_missing_count" -lt 0 ]]; then
  pruned_missing_count=0
fi

echo "=== Worktree Hygiene Audit ==="
echo "repo=$repo_root"
echo "registered_before=$before_count"
echo "registered_after=$after_count"
echo "missing_registrations_pruned=$pruned_missing_count"
echo "existing_secondary_preserved=$existing_secondary_count"
echo "dirty_secondary_preserved=$dirty_count"
echo "existing_worktrees_deleted=0"
