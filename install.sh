#!/bin/sh
# Idempotent installer for mac-yolo-safeguards.
# Creates symlinks at the install-target paths pointing back to this repo,
# then bootstraps the LaunchAgent.

set -e

REPO="$(cd "$(dirname "$0")" && pwd)"

mkdir -p "$HOME/.local/bin"
mkdir -p "$HOME/Library/LaunchAgents"
mkdir -p "$HOME/workspace/git/igor/antigravity-hub/antigravity-cli/bin"

link() {
  local SRC="$1"; local DEST="$2"
  # Replace existing file/symlink with a fresh symlink to the repo copy.
  if [ -L "$DEST" ] || [ -e "$DEST" ]; then rm -f "$DEST"; fi
  ln -s "$SRC" "$DEST"
  echo "  $DEST -> $SRC"
}

echo "=== Linking files ==="
link "$REPO/agy-yolo-wrapper.js"              "$HOME/workspace/git/igor/antigravity-hub/antigravity-cli/bin/agy-yolo-wrapper.js"
link "$REPO/sim-runaway-guard.sh"             "$HOME/.local/bin/sim-runaway-guard.sh"
link "$REPO/yolo-health"                      "$HOME/.local/bin/yolo-health"
link "$REPO/com.igor.shutdown-simulators.plist" "$HOME/Library/LaunchAgents/com.igor.shutdown-simulators.plist"

echo ""
echo "=== Bootstrapping LaunchAgent ==="
launchctl bootout gui/$(id -u)/com.igor.shutdown-simulators 2>/dev/null || true
launchctl bootstrap gui/$(id -u) "$HOME/Library/LaunchAgents/com.igor.shutdown-simulators.plist"
echo "  com.igor.shutdown-simulators bootstrapped"

echo ""
echo "=== Verifying ==="
"$HOME/.local/bin/yolo-health" || { echo "yolo-health reported failures"; exit 1; }
