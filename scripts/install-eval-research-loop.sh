#!/usr/bin/env bash
# Install overnight eval-research LaunchAgent on this Mac (Pro or mini).
# Writes only under evals/ + artifacts/eval-research/ via harness eval-research --write.
set -euo pipefail

REPO="${HERMES_REPO:-$(cd "$(dirname "$0")/.." && pwd)}"
PLIST_SRC="$REPO/launchd/com.igor.harness-eval-research.plist"
LABEL="com.igor.harness-eval-research"
UID_NUM="$(id -u)"
DEST="$HOME/Library/LaunchAgents/${LABEL}.plist"
LOG_DIR="$HOME/Library/Logs/hermes"
NODE_BIN="$(command -v node || true)"

if [[ -z "$NODE_BIN" ]]; then
  for c in /opt/homebrew/bin/node /usr/local/bin/node; do
    if [[ -x "$c" ]]; then NODE_BIN="$c"; break; fi
  done
fi
if [[ -z "$NODE_BIN" || ! -x "$NODE_BIN" ]]; then
  echo "ERROR: node not found" >&2
  exit 1
fi

mkdir -p "$HOME/Library/LaunchAgents" "$LOG_DIR" "$REPO/artifacts/eval-research"

# Render plist with absolute paths for this host
sed \
  -e "s|__REPO__|${REPO}|g" \
  -e "s|__NODE__|${NODE_BIN}|g" \
  -e "s|__HOME__|${HOME}|g" \
  "$PLIST_SRC" > "$DEST"

launchctl bootout "gui/${UID_NUM}/${LABEL}" 2>/dev/null || true
launchctl bootstrap "gui/${UID_NUM}" "$DEST"
launchctl enable "gui/${UID_NUM}/${LABEL}" 2>/dev/null || true
# Kick once so we have a receipt without waiting for the interval
launchctl kickstart -k "gui/${UID_NUM}/${LABEL}" 2>/dev/null || true

echo "Installed ${LABEL}"
echo "  plist: $DEST"
echo "  repo:  $REPO"
echo "  node:  $NODE_BIN"
echo "  logs:  $LOG_DIR/harness-eval-research.*.log"
echo "  receipt: $REPO/artifacts/eval-research/latest.json"
echo "Manual: cd \"$REPO\" && node tools/agent-swarm-harness.js eval-research --write --json"
