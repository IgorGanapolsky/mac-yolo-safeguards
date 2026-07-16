#!/bin/sh
# Idempotent installer for mac-yolo-safeguards.
# Creates symlinks at the install-target paths pointing back to this repo,
# then bootstraps the LaunchAgent.

set -e

REPO="$(cd "$(dirname "$0")" && pwd)"

# GitHub Actions may run on the operator's self-hosted Mac. Never let a smoke
# install replace live ~/.local/bin entrypoints or restart live LaunchAgents.
CI_SMOKE=0
INSTALL_HOME="$HOME"
if [ -n "${GITHUB_ACTIONS:-}" ] || [ "${CI:-}" = "true" ]; then
  CI_SMOKE=1
  INSTALL_HOME="${MAC_YOLO_CI_HOME:-${RUNNER_TEMP:-${TMPDIR:-/tmp}}/mac-yolo-safeguards-ci-home}"
  if [ "$INSTALL_HOME" = "$HOME" ]; then
    echo "install.sh: refusing CI smoke install into the operator HOME" >&2
    exit 2
  fi
  echo "CI smoke isolation: $INSTALL_HOME"
fi

mkdir -p "$INSTALL_HOME/.local/bin"
mkdir -p "$INSTALL_HOME/Library/LaunchAgents"

# --- Detect antigravity-cli path dynamically ---
AGY_CLI_DIR="$INSTALL_HOME/workspace/git/$USER/antigravity-hub/antigravity-cli"
if [ ! -d "$AGY_CLI_DIR" ]; then
  if [ -d "$INSTALL_HOME/workspace/git/igor/antigravity-hub/antigravity-cli" ]; then
    AGY_CLI_DIR="$INSTALL_HOME/workspace/git/igor/antigravity-hub/antigravity-cli"
  else
    echo "Searching for antigravity-cli directory under ~/workspace..."
    FOUND=$(find "$INSTALL_HOME/workspace" -type d -path "*/antigravity-hub/antigravity-cli" -maxdepth 5 2>/dev/null | head -n 1)
    if [ -n "$FOUND" ]; then
      AGY_CLI_DIR="$FOUND"
    else
      # If not found, default to standard dynamic user path
      AGY_CLI_DIR="$INSTALL_HOME/workspace/git/$USER/antigravity-hub/antigravity-cli"
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
link "$REPO/hermes-yolo-wrapper.js"           "$INSTALL_HOME/.local/bin/hermes-yolo"
link "$REPO/sim-runaway-guard.sh"             "$INSTALL_HOME/.local/bin/sim-runaway-guard.sh"
link "$REPO/yolo-health"                      "$INSTALL_HOME/.local/bin/yolo-health"

# Instead of symlinking the plist, write a copy with {{HOME}} substituted to point to the actual home directory
PLIST_DEST="$INSTALL_HOME/Library/LaunchAgents/com.igor.shutdown-simulators.plist"
if [ -f "$PLIST_DEST" ] || [ -L "$PLIST_DEST" ]; then rm -f "$PLIST_DEST"; fi
sed "s|{{HOME}}|$INSTALL_HOME|g" "$REPO/com.igor.shutdown-simulators.plist" > "$PLIST_DEST"
echo "  $PLIST_DEST created with resolved paths"

echo ""
echo "=== Bootstrapping LaunchAgent ==="
if [ "$CI_SMOKE" -eq 1 ]; then
  echo "  skipped in CI smoke mode; live LaunchAgent state is untouched"
else
  launchctl bootout gui/$(id -u)/com.igor.shutdown-simulators 2>/dev/null || true
  launchctl bootstrap gui/$(id -u) "$PLIST_DEST"
  echo "  com.igor.shutdown-simulators bootstrapped"
fi

echo ""
echo "=== Verifying ==="
HOME="$INSTALL_HOME" "$INSTALL_HOME/.local/bin/yolo-health" || { echo "yolo-health reported failures"; exit 1; }

# Preserve an operator's explicit zero-spend policy after this installer
# refreshes the Hermes symlink. CI smoke homes never inherit the live marker.
if [ -f "$INSTALL_HOME/.hermes/NO_PAID_SPEND" ]; then
  echo ""
  echo "=== Restoring zero-spend command gate ==="
  HOME="$INSTALL_HOME" sh "$REPO/scripts/install-zero-spend-gate.sh" --install
fi
