#!/usr/bin/env bash
# Install / heal fleet-wide local repo intelligence (JetBrains Context equivalent).
# Safe for multi-worktree monorepos: indexes ONLY isolated plain clones under
# ~/.hermes/semantic-index/ — never the live multi-worktree checkout.
set -euo pipefail

REPO="$(cd "$(dirname "$0")/.." && pwd)"
HOME_DIR="${HOME:-/Users/igorganapolsky}"
INDEX_ROOT="${HERMES_SEMANTIC_INDEX_ROOT:-$HOME_DIR/.hermes/semantic-index}"
CLONE_NAME="${HERMES_SEMANTIC_CLONE_NAME:-mac-yolo-safeguards}"
CLONE_PATH="$INDEX_ROOT/$CLONE_NAME"
REMOTE_URL="${HERMES_SEMANTIC_REMOTE:-https://github.com/IgorGanapolsky/mac-yolo-safeguards.git}"
PLIST_SRC="$REPO/com.igor.fleet-repo-intelligence.plist"
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

if [[ ! -d "$CLONE_PATH/.git" ]]; then
  log "Cloning isolated index tree (plain clone, not a worktree)…"
  git clone --depth 1 --single-branch --branch main "$REMOTE_URL" "$CLONE_PATH"
else
  log "Refreshing isolated clone…"
  git -C "$CLONE_PATH" fetch origin main --depth 1
  git -C "$CLONE_PATH" checkout main 2>/dev/null || git -C "$CLONE_PATH" checkout -B main origin/main
  git -C "$CLONE_PATH" reset --hard origin/main
fi

if [[ ! -d "$CLONE_PATH/.grepai" ]]; then
  log "grepai init (ollama + gob)…"
  (cd "$CLONE_PATH" && grepai init --provider ollama --backend gob --yes)
fi

# Retrieval tuning: enable hybrid (BM25 + dense, RRF) and the startup index check.
#
# `grepai init` writes hybrid.enabled=false, so the BM25+vector RRF fusion this
# config already describes (k: 60) never actually ran — every query was pure
# dense retrieval. Dense embeddings cannot match an exact identifier, which is
# most of what an agent searches for.
#
# Measured on this repo, query "deploy cloudflare with lock", target
# scripts/deploy-cloudflare-with-lock.sh:
#
#   hybrid off  target ABSENT from the top 10; 4 of the top 5 hits were
#               package-lock.json chunks
#   hybrid on   target holds the top 4; zero lockfile chunks in the top 10
#
# A path penalty for *-lock.json was tried as well and turned out to be
# unnecessary: BM25 already ranks lockfile chunks out of the way, because they
# do not lexically match code queries. It is deliberately NOT applied here —
# an unmeasured knob is a liability, not a safeguard.
#
# This lives in the installer because .grepai/config.yaml sits OUTSIDE git
# (~/.hermes/semantic-index/...). Enabling hybrid by hand on one Mac is not
# reproducible: the next machine, or the next `grepai init`, silently reverts to
# dense-only, and dense-only fails quietly by returning plausible wrong files
# rather than an error. Idempotent, so re-running the installer is safe.
#
# NOTE: config changes only take effect after the index is rebuilt.
tune_grepai_config() {
  local cfg="$CLONE_PATH/.grepai/config.yaml"
  [[ -f "$cfg" ]] || { printf 'config not found, skipped'; return 0; }
  python3 - "$cfg" <<'PY'
import sys
p = sys.argv[1]
lines = open(p, encoding='utf-8').read().split('\n')
out, changed = [], False
# Edit as TEXT, line by line, matching on the PRECEDING 'hybrid:' line so this
# cannot hit some other 'enabled: false'.
#
# Do NOT "simplify" this into a yaml.safe_load/safe_dump round-trip: that
# re-serialises the config's timestamp fields into a form grepai's Go time
# parser rejects ("cannot parse ... as \"T\""), which takes the whole index
# down with a config-load error. Learned the hard way, 2026-07-29.
for i, ln in enumerate(lines):
    if ln.strip() == 'enabled: false' and i and lines[i - 1].strip() == 'hybrid:':
        out.append(ln.replace('false', 'true'))
        changed = True
        continue
    # check_on_startup defaults to FALSE, so launching the watcher does NOT
    # verify the index against the corpus. That is precisely how the index sat
    # frozen for days while `grepai status` reported a healthy running watcher:
    # nothing ever compared what was indexed against what was on disk, and a
    # stale index answers every query confidently from an old snapshot.
    if ln.strip() == 'check_on_startup: false':
        out.append(ln.replace('false', 'true'))
        changed = True
        continue
    out.append(ln)
if changed:
    open(p, 'w', encoding='utf-8').write('\n'.join(out))
    print('tuned: hybrid + startup index check (rebuild the index for hybrid to take effect)')
else:
    print('already tuned')
PY
}
log "grepai retrieval tuning: $(tune_grepai_config)"

# Ensure watcher for this clone only (isolated .git → no worktree fan-out)
if ! (cd "$CLONE_PATH" && grepai status 2>/dev/null | grep -qi 'Watcher: running'); then
  log "Starting grepai watch --background on isolated clone…"
  (cd "$CLONE_PATH" && grepai watch --background) || true
else
  log "grepai watcher already running for isolated clone"
fi

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

# LaunchAgent for daily refresh
if [[ -f "$PLIST_SRC" ]]; then
  sed "s|__HOME__|$HOME_DIR|g; s|__REPO__|$REPO|g" "$PLIST_SRC" >"$PLIST_DST"
  launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
  launchctl bootstrap "gui/$(id -u)" "$PLIST_DST" 2>/dev/null || launchctl load -w "$PLIST_DST" 2>/dev/null || true
  log "LaunchAgent $LABEL installed → $PLIST_DST"
fi

# agent-setup: append grepai instructions to agent config files (idempotent)
if [[ -d "$REPO" ]]; then
  (cd "$REPO" && grepai agent-setup 2>/dev/null) || true
fi

log "Status:"
node "$REPO/tools/fleet-repo-intelligence-status.js" || true
log "Done. MCP: repo .mcp.json already points grepai at $CLONE_PATH"
