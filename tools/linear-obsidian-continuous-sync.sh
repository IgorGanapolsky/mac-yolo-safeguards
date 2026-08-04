#!/bin/bash
# Continuous Linear <-> Obsidian <-> GitHub sync.
#
# 2026-08-04: this script reported success for weeks while GitHub->Linear synced
# NOTHING. Every step ended in `|| true`, the tail always printed "Sync completed
# cleanly", and launchctl showed last exit 0 — while github-linear-sync.js was
# failing all three issues with Linear USAGE_LIMIT_EXCEEDED (free active-issue
# cap) and then printing its own "Sync Complete! 0 GitHub issues synced".
#
# Later the same day: github-linear-sync.js was also NON-IDEMPOTENT — every
# LaunchAgent tick created NEW Linear issues for the same 3 GitHub Issues
# ([GH-#132/141/242] × dozens), blowing the free active-issue cap. The sync is
# now upsert/dedupe: one Linear issue per open GH number; cancel stale clones.
#
# Rules now:
#   1. A step that fails is REPORTED and makes the run exit non-zero.
#   2. Steps still all run (one broken leg must not hide the others).
#   3. "⚠️ Failed to sync" / create failures are treated as failure.
#   4. A green run that keeps existing 1:1 GH↔Linear mappings is SUCCESS
#      (idempotent no-op is correct, not "moved nothing").
set -uo pipefail
export PATH="/Users/igorganapolsky/.local/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:$PATH"
cd /Users/igorganapolsky/workspace/git/igor/mac-yolo-safeguards || exit 1

NODE_BIN="/Users/igorganapolsky/.local/bin/node"
if [ ! -x "$NODE_BIN" ]; then
  NODE_BIN="$(which node)"
fi

LOG=/tmp/linear-obsidian-sync.log
FAILURES=()

run_step() {
  local label="$1" script="$2"
  local out rc
  out="$("$NODE_BIN" "$script" 2>&1)"
  rc=$?
  printf '%s\n' "$out" >> "$LOG"

  if [ "$rc" -ne 0 ]; then
    FAILURES+=("$label (exit $rc)")
    echo "[FAIL] $label exited $rc" | tee -a "$LOG"
    return
  fi

  # Semantic failure: the step ran, reported success, and moved nothing while
  # explicitly logging per-item failures. Exit 0 is not evidence of work done.
  if printf '%s' "$out" | grep -qE '^⚠️ Failed to sync'; then
    local n
    n="$(printf '%s' "$out" | grep -cE '^⚠️ Failed to sync')"
    FAILURES+=("$label ($n item(s) rejected by the API)")
    echo "[FAIL] $label rejected $n item(s) despite exit 0" | tee -a "$LOG"
    if printf '%s' "$out" | grep -q 'USAGE_LIMIT_EXCEEDED'; then
      echo "[CAUSE] Linear workspace is at its free active-issue cap — issueCreate is refused." | tee -a "$LOG"
    fi
  fi
}

echo "[$(date -u)] Running continuous Linear <-> Obsidian <-> GitHub sync..." | tee -a "$LOG"

run_step "github->linear"  tools/github-linear-sync.js
run_step "obsidian<->linear" tools/obsidian-linear-sync.js
run_step "herdr->linear"   tools/herdr-linear-integration.js
run_step "repo-root-hygiene" tools/repo-root-hygiene.js

if [ "${#FAILURES[@]}" -gt 0 ]; then
  {
    echo "[$(date -u)] SYNC DEGRADED — ${#FAILURES[@]} step(s) did not complete:"
    for f in "${FAILURES[@]}"; do echo "  - $f"; done
  } | tee -a "$LOG"
  exit 1
fi

echo "[$(date -u)] Sync completed cleanly (all steps moved data)." | tee -a "$LOG"
