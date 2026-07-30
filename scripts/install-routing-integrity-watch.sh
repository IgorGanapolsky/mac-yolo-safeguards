#!/usr/bin/env bash
# install-routing-integrity-watch.sh — schedule tools/hermes-routing-integrity-watch.js
#
# Without this, the sentinel is a tool nobody runs: CI exercises its unit tests, but
# the LIVE ~/.hermes/config.yaml on each Mac is never evaluated, so the 2026-07-30
# routing outage could recur exactly as before (PR #1248 review, P1).
#
# Installs a per-user LaunchAgent that runs the watcher every 30 minutes.
#
#   ./scripts/install-routing-integrity-watch.sh            # install / reinstall
#   ./scripts/install-routing-integrity-watch.sh --uninstall
#
# Run it on BOTH Macs. They are deliberately independent installs — never sync or
# symlink one to the other.
set -euo pipefail

LABEL="com.igor.hermes-routing-integrity-watch"
PLIST="$HOME/Library/LaunchAgents/${LABEL}.plist"
LOG="$HOME/.hermes/logs/routing-integrity-watch.log"
INTERVAL="${ROUTING_WATCH_INTERVAL:-1800}"

uninstall() {
  launchctl bootout "gui/$(id -u)/${LABEL}" 2>/dev/null || true
  rm -f "$PLIST"
  echo "✓ uninstalled ${LABEL}"
}

if [[ "${1:-}" == "--uninstall" ]]; then
  uninstall
  exit 0
fi

# Resolve the repo root from THIS script, then reject a worktree checkout.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
TOOL="${REPO_ROOT}/tools/hermes-routing-integrity-watch.js"

# Hard-won: LaunchAgents installed from .worktrees/* die with exit 127 the moment
# that worktree is pruned, and the failure looks like "the job just isn't working".
# Refuse rather than install a job with a path that is guaranteed to rot.
if [[ "$REPO_ROOT" == *"/.worktrees/"* ]]; then
  echo "✗ refusing to install from a git worktree: $REPO_ROOT" >&2
  echo "  Worktrees get pruned and the LaunchAgent would silently exit 127." >&2
  echo "  Run this from the canonical checkout instead." >&2
  exit 1
fi

if [[ ! -f "$TOOL" ]]; then
  echo "✗ tool not found: $TOOL" >&2
  exit 1
fi

NODE_BIN="$(command -v node || true)"
if [[ -z "$NODE_BIN" ]]; then
  echo "✗ node not found on PATH" >&2
  exit 1
fi

mkdir -p "$HOME/Library/LaunchAgents" "$(dirname "$LOG")"

cat > "$PLIST" <<PLIST_EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>${LABEL}</string>
    <key>ProgramArguments</key>
    <array>
        <string>${NODE_BIN}</string>
        <string>${TOOL}</string>
    </array>
    <key>EnvironmentVariables</key>
    <dict>
        <key>HOME</key>
        <string>${HOME}</string>
        <key>PATH</key>
        <string>/usr/bin:/bin:/usr/sbin:/sbin:/opt/homebrew/bin:/usr/local/bin</string>
    </dict>
    <key>StartInterval</key>
    <integer>${INTERVAL}</integer>
    <key>RunAtLoad</key>
    <true/>
    <key>StandardOutPath</key>
    <string>${LOG}</string>
    <key>StandardErrorPath</key>
    <string>${LOG}</string>
</dict>
</plist>
PLIST_EOF

# A plist that does not parse is how the gateway lost supervision on 2026-07-30 —
# launchd rejected it and the failure was invisible. Verify before loading.
if ! plutil -lint "$PLIST" >/dev/null; then
  echo "✗ generated plist does not parse — not loading" >&2
  plutil -lint "$PLIST" >&2 || true
  exit 1
fi

launchctl bootout "gui/$(id -u)/${LABEL}" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$PLIST"

# Prove it loaded rather than assuming bootstrap succeeded.
if launchctl print "gui/$(id -u)/${LABEL}" >/dev/null 2>&1; then
  echo "✓ ${LABEL} loaded (every ${INTERVAL}s)"
  echo "  tool: ${TOOL}"
  echo "  log:  ${LOG}"
else
  echo "✗ bootstrap reported success but the job is not loaded" >&2
  exit 1
fi

echo
echo "— current verdict —"
"$NODE_BIN" "$TOOL" --dry-run || true
