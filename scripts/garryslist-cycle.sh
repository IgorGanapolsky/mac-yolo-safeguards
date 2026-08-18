#!/usr/bin/env bash
# LaunchAgent entry for Garry's List continuous cycle.
set -euo pipefail
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:${PATH:-}"
ROOT="${GARRYSLIST_REPO_ROOT:-$HOME/workspace/git/igor/mac-yolo-safeguards}"
# Prefer installed main tree; fall back to worktree if tool only exists there
TOOL="$ROOT/tools/garryslist-continuous-ops.js"
if [[ ! -f "$TOOL" ]]; then
  TOOL="$HOME/workspace/git/igor/mac-yolo-safeguards-worktrees/garryslist-continuous-20260812/tools/garryslist-continuous-ops.js"
fi
LOG_DIR="${GARRYSLIST_STATE_DIR:-$HOME/.hermes-garryslist}/logs"
mkdir -p "$LOG_DIR"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
exec /usr/bin/env node "$TOOL" cycle --json >>"$LOG_DIR/cycle-$STAMP.jsonl" 2>>"$LOG_DIR/cycle.err.log"
