#!/bin/sh
# Idempotent installer for mac-yolo-safeguards.
# Creates symlinks at the install-target paths pointing back to this repo,
# then bootstraps the LaunchAgent.

set -e

REPO="$(cd "$(dirname "$0")" && pwd)"

mkdir -p "$HOME/.local/bin"
mkdir -p "$HOME/Library/LaunchAgents"

# --- Detect antigravity-cli path dynamically ---
AGY_CLI_DIR="$HOME/workspace/git/$USER/antigravity-hub/antigravity-cli"
if [ ! -d "$AGY_CLI_DIR" ]; then
  if [ -d "$HOME/workspace/git/igor/antigravity-hub/antigravity-cli" ]; then
    AGY_CLI_DIR="$HOME/workspace/git/igor/antigravity-hub/antigravity-cli"
  else
    echo "Searching for antigravity-cli directory under ~/workspace..."
    FOUND=$(find "$HOME/workspace" -type d -path "*/antigravity-hub/antigravity-cli" -maxdepth 5 2>/dev/null | head -n 1)
    if [ -n "$FOUND" ]; then
      AGY_CLI_DIR="$FOUND"
    else
      # If not found, default to standard dynamic user path
      AGY_CLI_DIR="$HOME/workspace/git/$USER/antigravity-hub/antigravity-cli"
    fi
  fi
fi

mkdir -p "$AGY_CLI_DIR/bin" 2>/dev/null || true

link() {
  local SRC="$1"; local DEST="$2"
  # Replace existing file/symlink with a fresh symlink to the repo copy.
  if [ -L "$DEST" ] || [ -e "$DEST" ]; then rm -f "$DEST"; fi
  ln -s "$SRC" "$DEST"
  echo "  $DEST -> $SRC"
}

echo "=== Linking files ==="
link "$REPO/agy-yolo-wrapper.js"              "$AGY_CLI_DIR/bin/agy-yolo-wrapper.js"
link "$REPO/sim-runaway-guard.sh"             "$HOME/.local/bin/sim-runaway-guard.sh"
link "$REPO/yolo-health"                      "$HOME/.local/bin/yolo-health"

# Instead of symlinking the plist, write a copy with {{HOME}} substituted to point to the actual home directory
PLIST_DEST="$HOME/Library/LaunchAgents/com.igor.shutdown-simulators.plist"
if [ -f "$PLIST_DEST" ] || [ -L "$PLIST_DEST" ]; then rm -f "$PLIST_DEST"; fi
sed "s|{{HOME}}|$HOME|g" "$REPO/com.igor.shutdown-simulators.plist" > "$PLIST_DEST"
echo "  $PLIST_DEST created with resolved paths"

echo ""
echo "=== Bootstrapping LaunchAgent ==="
launchctl bootout gui/$(id -u)/com.igor.shutdown-simulators 2>/dev/null || true
launchctl bootstrap gui/$(id -u) "$PLIST_DEST"
echo "  com.igor.shutdown-simulators bootstrapped"

echo ""
echo "=== Verifying ==="
"$HOME/.local/bin/yolo-health" || { echo "yolo-health reported failures"; exit 1; }
