#!/usr/bin/env bash
# Periodic vault pull (ff-only when clean) + agent-sync-brief into Obsidian.
# Safe for multi-agent vault: never force-pushes, never auto-resolves conflicts.
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
vault="${VAULT_PATH:-$HOME/Documents/AI-Agent-Sync}"
node_bin="${NODE_BIN:-$(command -v node)}"

if [[ -z "$node_bin" ]]; then
  echo "node not found in PATH" >&2
  exit 1
fi

sync_vault() {
  local target="$vault"
  if ! cd "$target" 2>/dev/null \
    || ! git rev-parse --git-dir >/dev/null 2>&1 \
    || ! git status --porcelain >/dev/null 2>&1; then
    echo "vault pull skipped: cannot read $target (TCC/offline); brief still runs"
    return 0
  fi

  git fetch --all --prune --quiet 2>/dev/null || {
    echo "vault pull skipped: git fetch failed"
    return 0
  }

  local dirty
  dirty="$(git status --porcelain --untracked-files=no | wc -l | tr -d ' ')"
  if [[ "$dirty" -gt 0 ]]; then
    echo "vault pull skipped: $dirty tracked dirty file(s); agent live"
    return 0
  fi

  if git rev-parse --abbrev-ref '@{u}' >/dev/null 2>&1; then
    if git merge --ff-only '@{u}' --quiet 2>/dev/null; then
      echo "vault pull: ff-only sync ok"
    else
      echo "vault pull skipped: branch diverged; needs human/PR"
    fi
  else
    echo "vault pull skipped: no upstream configured"
  fi
}

if [[ "${1:-}" == "--pull-only" ]]; then
  sync_vault
  exit 0
fi

sync_vault
exec "$node_bin" "$repo_root/tools/agent-sync-brief.js" --vault "$vault"
