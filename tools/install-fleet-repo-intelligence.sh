#!/usr/bin/env bash
# Install / heal fleet-wide local repo intelligence (JetBrains Context equivalent).
# Safe for multi-worktree monorepos: indexes ONLY isolated plain clones under
# ~/.hermes/semantic-index/ — never the live multi-worktree checkout.
set -euo pipefail

HOME_DIR="${HOME:-/Users/igorganapolsky}"
SOURCE_REPO="$(cd "$(dirname "$0")/.." && pwd)"
REPO="${HERMES_RECONCILER_REPO:-$HOME_DIR/workspace/git/igor/mac-yolo-safeguards}"
INDEX_ROOT="${HERMES_SEMANTIC_INDEX_ROOT:-$HOME_DIR/.hermes/semantic-index}"
REMOTE_URL="${HERMES_SEMANTIC_REMOTE:-https://github.com/IgorGanapolsky/mac-yolo-safeguards.git}"
PLIST_SRC="$SOURCE_REPO/com.igor.fleet-repo-intelligence.plist"
PLIST_DST="$HOME_DIR/Library/LaunchAgents/com.igor.fleet-repo-intelligence.plist"
PLIST_PENDING="$HOME_DIR/Library/Logs/.com.igor.fleet-repo-intelligence.pending-$$.plist"
LABEL="com.igor.fleet-repo-intelligence"
LEGACY_LABEL="com.igor.index-microbatch"
LEGACY_PLIST="$HOME_DIR/Library/LaunchAgents/$LEGACY_LABEL.plist"
LEGACY_BACKUP=""
CANONICAL_BACKUP=""
ROLLBACK_RESULT="no prior scheduler was available"

log() { printf '%s\n' "$*"; }
cleanup_pending() { rm -f -- "$PLIST_PENDING"; }
trap cleanup_pending EXIT

rollback_activation() {
  launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
  if [[ -f "$PLIST_DST" ]]; then
    FAILED_CANONICAL="$HOME_DIR/Library/Logs/$LABEL.failed-$(date +%Y%m%d%H%M%S).plist"
    mv "$PLIST_DST" "$FAILED_CANONICAL"
  fi
  if [[ -n "$CANONICAL_BACKUP" && -f "$CANONICAL_BACKUP" ]]; then
    mv "$CANONICAL_BACKUP" "$PLIST_DST"
    if launchctl bootstrap "gui/$(id -u)" "$PLIST_DST" \
      || launchctl load -w "$PLIST_DST"; then
      if launchctl print "gui/$(id -u)/$LABEL" >/dev/null; then
        ROLLBACK_RESULT="previous canonical scheduler restored"
        return 0
      fi
    fi
    ROLLBACK_RESULT="previous canonical scheduler restore failed"
    return 1
  fi
  if [[ -n "$LEGACY_BACKUP" && -f "$LEGACY_BACKUP" ]]; then
    mv "$LEGACY_BACKUP" "$LEGACY_PLIST"
    if launchctl bootstrap "gui/$(id -u)" "$LEGACY_PLIST" \
      || launchctl load -w "$LEGACY_PLIST"; then
      if launchctl print "gui/$(id -u)/$LEGACY_LABEL" >/dev/null; then
        ROLLBACK_RESULT="legacy scheduler restored"
        return 0
      fi
    fi
    ROLLBACK_RESULT="legacy scheduler restore failed"
    return 1
  fi
  return 1
}

need_bin() {
  if ! command -v "$1" >/dev/null 2>&1; then
    log "ERROR: missing $1"
    exit 1
  fi
}

need_bin git
need_bin node
NODE_BIN="$(command -v node)"

if [[ ! -f "$REPO/tools/grepai-microbatch-reconciler.js" ]]; then
  log "ERROR: canonical reconciler is missing at $REPO/tools/grepai-microbatch-reconciler.js"
  exit 1
fi

if ! command -v grepai >/dev/null 2>&1; then
  log "Installing grepai via Homebrew…"
  brew install yoanbernabeu/tap/grepai
fi

if ! command -v ollama >/dev/null 2>&1; then
  log "WARN: ollama not on PATH — embeddings will fail until Ollama is running"
else
  if ! ollama list 2>/dev/null | grep -q nomic-embed-text; then
    log "Pulling nomic-embed-text (one-time)…"
    ollama pull nomic-embed-text || true
  fi
fi

mkdir -p "$INDEX_ROOT" "$HOME_DIR/Library/Logs" "$HOME_DIR/Library/LaunchAgents"

# hermes-context: index this monorepo + hermes-eval if present
if command -v hermes-context >/dev/null 2>&1; then
  log "hermes-context index mac-yolo-safeguards…"
  hermes-context index "$REPO" --name mac-yolo-safeguards 2>/dev/null || true
  if [[ -d "$HOME_DIR/workspace/git/igor/hermes-eval/.git" ]]; then
    hermes-context index "$HOME_DIR/workspace/git/igor/hermes-eval" --name hermes-eval 2>/dev/null || true
  fi
else
  log "WARN: hermes-context not on PATH (optional multi-repo CLI)"
fi

# Establish a source-bound generation before advertising MCP as available.
# The reconciler builds in a separate plain clone, validates retrieval, and
# atomically publishes only after success; it never indexes the worktree fleet.
log "Reconciling latest origin/main into a verified grepai generation…"
HERMES_SEMANTIC_INDEX_ROOT="$INDEX_ROOT" \
HERMES_SEMANTIC_REMOTE="$REMOTE_URL" \
  node "$REPO/tools/grepai-microbatch-reconciler.js" --once --json

# Install the 60-second watchdog only after the initial generation commits, so
# RunAtLoad cannot race the foreground bootstrap and make it observe `busy`.
if [[ -f "$PLIST_SRC" ]]; then
  SERVED_CLONE="$INDEX_ROOT/mac-yolo-safeguards"
  if [[ -d "$SERVED_CLONE/.grepai" ]]; then
    (cd "$SERVED_CLONE" && grepai watch --stop >/dev/null)
    WATCH_STATUS="$(cd "$SERVED_CLONE" && grepai watch --status 2>&1)"
    if printf '%s' "$WATCH_STATUS" | grep -Eq 'Status:[[:space:]]*running'; then
      log "ERROR: served grepai watcher is still running"
      exit 1
    fi
  fi
  sed \
    -e "s|__HOME__|$HOME_DIR|g" \
    -e "s|__REPO__|$REPO|g" \
    -e "s|__NODE__|$NODE_BIN|g" \
    -e "s|__INDEX_ROOT__|$INDEX_ROOT|g" \
    -e "s|__REMOTE__|$REMOTE_URL|g" \
    "$PLIST_SRC" >"$PLIST_PENDING"
  plutil -lint "$PLIST_PENDING" >/dev/null
  # PR #1283 briefly introduced a second 15-minute controller. Retire that
  # label before loading the canonical 60-second source-bound reconciler.
  launchctl bootout "gui/$(id -u)/$LEGACY_LABEL" 2>/dev/null || true
  if launchctl print "gui/$(id -u)/$LEGACY_LABEL" >/dev/null 2>&1; then
    log "ERROR: legacy duplicate controller $LEGACY_LABEL is still loaded"
    exit 1
  fi
  if [[ -f "$LEGACY_PLIST" ]]; then
    LEGACY_BACKUP="$LEGACY_PLIST.disabled-by-source-bound-reconciler-$(date +%Y%m%d%H%M%S)"
    mv "$LEGACY_PLIST" "$LEGACY_BACKUP"
    log "Retired legacy LaunchAgent plist → $LEGACY_BACKUP"
  fi
  launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
  if [[ -f "$PLIST_DST" ]]; then
    CANONICAL_BACKUP="$HOME_DIR/Library/Logs/$LABEL.previous-$(date +%Y%m%d%H%M%S)-$$.plist"
    mv "$PLIST_DST" "$CANONICAL_BACKUP"
  fi
  mv "$PLIST_PENDING" "$PLIST_DST"
  if ! launchctl bootstrap "gui/$(id -u)" "$PLIST_DST"; then
    if ! launchctl load -w "$PLIST_DST"; then
      rollback_activation || true
      log "ERROR: canonical LaunchAgent activation failed; $ROLLBACK_RESULT"
      exit 1
    fi
  fi
  if ! launchctl print "gui/$(id -u)/$LABEL" >/dev/null; then
    rollback_activation || true
    log "ERROR: canonical LaunchAgent verification failed; $ROLLBACK_RESULT"
    exit 1
  fi
  if [[ -n "$CANONICAL_BACKUP" && -f "$CANONICAL_BACKUP" ]]; then
    rm -f -- "$CANONICAL_BACKUP"
  fi
  log "LaunchAgent $LABEL installed → $PLIST_DST"
fi

# agent-setup: append grepai instructions to agent config files (idempotent)
if [[ -d "$REPO" ]]; then
  (cd "$REPO" && grepai agent-setup 2>/dev/null) || true
fi

log "Status:"
node "$REPO/tools/fleet-repo-intelligence-status.js"
log "MCP is gated on the committed source-bound generation receipt."
