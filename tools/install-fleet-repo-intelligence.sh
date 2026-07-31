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
LABEL="com.igor.fleet-repo-intelligence"

log() { printf '%s\n' "$*"; }

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
  sed \
    -e "s|__HOME__|$HOME_DIR|g" \
    -e "s|__REPO__|$REPO|g" \
    -e "s|__NODE__|$NODE_BIN|g" \
    -e "s|__INDEX_ROOT__|$INDEX_ROOT|g" \
    -e "s|__REMOTE__|$REMOTE_URL|g" \
    "$PLIST_SRC" >"$PLIST_DST"
  plutil -lint "$PLIST_DST" >/dev/null
  launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
  if ! launchctl bootstrap "gui/$(id -u)" "$PLIST_DST"; then
    launchctl load -w "$PLIST_DST"
  fi
  launchctl print "gui/$(id -u)/$LABEL" >/dev/null
  log "LaunchAgent $LABEL installed → $PLIST_DST"
fi

# agent-setup: append grepai instructions to agent config files (idempotent)
if [[ -d "$REPO" ]]; then
  (cd "$REPO" && grepai agent-setup 2>/dev/null) || true
fi

log "Status:"
node "$REPO/tools/fleet-repo-intelligence-status.js"
log "MCP is gated on the committed source-bound generation receipt."
