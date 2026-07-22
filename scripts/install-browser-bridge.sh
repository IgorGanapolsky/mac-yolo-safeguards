#!/usr/bin/env bash
# install-browser-bridge.sh — WebBridge-style one-command Local Agent connect.
#
# Steal: Kimi WebBridge's "install + paste one command + agent drives browser in ~1 min".
# Grounded in existing hosting: com.hermes.chrome-cdp + hermes-agent browser tools.
# Preferred: --mode=debugger (chrome.debugger extension, no Chrome restart).
#
#   bash scripts/install-browser-bridge.sh --mode=debugger
#   bash scripts/install-browser-bridge.sh
#   curl -fsSL https://raw.githubusercontent.com/IgorGanapolsky/mac-yolo-safeguards/main/scripts/install-browser-bridge.sh | bash
#
set -euo pipefail

say() { printf '\033[1;35m▸ %s\033[0m\n' "$1"; }

for arg in "$@"; do
  case "$arg" in
    --help|-h)
      cat <<'EOF'
Usage: install-browser-bridge.sh [--mode=debugger|cdp] [--profile=dedicated|daily]

  --mode=debugger  chrome.debugger extension path (default steal; NO Chrome restart)
  --mode=cdp       LaunchAgent + --remote-debugging-port (legacy / fallback)

  --profile=dedicated  Hermes-isolated Chrome profile (cdp mode default)
  --profile=daily      Everyday Chrome profile (cdp mode; quits Chrome once)

After this finishes, Hermes Mobile Chat → Tools → Browser Automation can drive
the Mac browser. No adb. No phone extension.

Requires HERMES_ALLOW_INTERACTIVE_CHROME=1 (default off — no desktop hijack).
EOF
      exit 0
      ;;
  esac
done

repo_root_early="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck disable=SC1091
source "${repo_root_early}/scripts/hermes-interactive-chrome-gate.sh"
if ! hermes_require_interactive_chrome; then
  exit 0
fi

MODE="cdp"
PROFILE="dedicated"
for arg in "$@"; do
  case "$arg" in
    --mode=debugger|debugger|--debugger) MODE="debugger" ;;
    --mode=cdp|cdp) MODE="cdp" ;;
    --profile=daily|daily|--daily) PROFILE="daily" ;;
    --profile=dedicated|dedicated) PROFILE="dedicated" ;;
    --help|-h)
      cat <<'EOF'
Usage: install-browser-bridge.sh [--mode=debugger|cdp] [--profile=dedicated|daily]

  --mode=debugger  chrome.debugger extension path (default steal; NO Chrome restart)
  --mode=cdp       LaunchAgent + --remote-debugging-port (legacy / fallback)

  --profile=dedicated  Hermes-isolated Chrome profile (cdp mode default)
  --profile=daily      Everyday Chrome profile (cdp mode; quits Chrome once)

After this finishes, Hermes Mobile Chat → Tools → Browser Automation can drive
the Mac browser. No adb. No phone extension.
EOF
      exit 0
      ;;
  esac
done

# Resolve repo root when run from a clone; otherwise fetch scripts to ~/.hermes/browser-bridge
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [[ -x "${SCRIPT_DIR}/configure-browser-control.sh" ]]; then
  REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
else
  DEST="${HERMES_BROWSER_BRIDGE_DIR:-$HOME/.hermes/browser-bridge}"
  mkdir -p "$DEST"
  say "Fetching Hermes browser-bridge scripts…"
  BASE="${HERMES_BROWSER_BRIDGE_SRC:-https://raw.githubusercontent.com/IgorGanapolsky/mac-yolo-safeguards/main}"
  for f in \
    scripts/configure-browser-control.sh \
    scripts/hermes-chrome-cdp.sh \
    scripts/install-hermes-chrome-cdp.sh \
    scripts/hermes-chrome-debugger-bridge.js \
    scripts/install-hermes-chrome-debugger.sh \
    scripts/wire-hermes-browser-cdp.sh \
    com.hermes.chrome-cdp.plist \
    com.hermes.chrome-debugger.plist; do
    mkdir -p "$DEST/$(dirname "$f")"
    curl -fsSL "$BASE/$f" -o "$DEST/$f"
  done
  chmod +x "$DEST"/scripts/*.sh
  chmod +x "$DEST"/scripts/hermes-chrome-debugger-bridge.js 2>/dev/null || true
  REPO_ROOT="$DEST"
fi

STATE_FILE="${HERMES_BROWSER_BRIDGE_STATE:-$HOME/.hermes/browser-bridge.env}"
mkdir -p "$(dirname "$STATE_FILE")"

if [[ "$MODE" == "debugger" ]]; then
  cat >"$STATE_FILE" <<EOF
HERMES_BROWSER_BRIDGE_MODE=debugger
HERMES_CDP_PORT=9222
HERMES_CDP_BIND=127.0.0.1
HERMES_DEBUGGER_EXT_PORT=9223
EOF
  chmod 600 "$STATE_FILE" 2>/dev/null || true

  say "Installing chrome.debugger bridge (no Chrome restart)…"
  bash "${REPO_ROOT}/scripts/install-hermes-chrome-debugger.sh"

  say "Wiring hermes-agent browser.cdp_url → ws://127.0.0.1:9222…"
  bash "${REPO_ROOT}/scripts/wire-hermes-browser-cdp.sh" --url "ws://127.0.0.1:9222"

  if [[ -f "${HOME}/Library/LaunchAgents/ai.hermes.gateway.plist" ]]; then
    say "Kickstarting Hermes gateway so it picks up browser.cdp_url…"
    launchctl kickstart -k "gui/$(id -u)/ai.hermes.gateway" 2>/dev/null || true
  fi

  EXT_DIR="${REPO_ROOT}/extensions/hermes-webbridge"
  say "Bridge connected (debugger mode)."
  echo ""
  echo "Load the unpacked extension (one-time):"
  echo "  1. Chrome → chrome://extensions → Developer mode"
  echo "  2. Load unpacked → ${EXT_DIR}"
  echo "  3. Accept debugger permission when prompted on first attach"
  echo ""
  echo "Paste this into your local agent / Hermes chat:"
  echo ""
  echo "  Use the local Chrome CDP bridge at ws://127.0.0.1:9222 (browser tools)."
  echo "  Open example.com, extract the heading, then stop."
  echo ""
  echo "Hermes Mobile: Pair this Mac → Chat → Tools → Browser Automation on."
  echo "Docs: ${REPO_ROOT}/docs/BROWSER-CONTROL.md"
  exit 0
fi

if [[ "$PROFILE" == "daily" ]]; then
  export HERMES_CDP_PROFILE="${HERMES_CDP_DAILY_PROFILE:-$HOME/Library/Application Support/Google/Chrome}"
  cat >"$STATE_FILE" <<EOF
HERMES_BROWSER_BRIDGE_MODE=cdp
HERMES_CDP_PROFILE_MODE=daily
HERMES_CDP_PROFILE="${HERMES_CDP_PROFILE}"
HERMES_CDP_PORT=9222
HERMES_CDP_BIND=127.0.0.1
EOF
  say "Daily Chrome mode — quitting Chrome so DevTools can attach to your logins…"
  osascript -e 'tell application "Google Chrome" to quit' 2>/dev/null || true
  sleep 2
else
  cat >"$STATE_FILE" <<EOF
HERMES_BROWSER_BRIDGE_MODE=cdp
HERMES_CDP_PROFILE_MODE=dedicated
HERMES_CDP_PROFILE="${HOME}/.hermes/chrome-cdp-profile"
HERMES_CDP_PORT=9222
HERMES_CDP_BIND=127.0.0.1
EOF
  export HERMES_CDP_PROFILE="${HOME}/.hermes/chrome-cdp-profile"
fi
chmod 600 "$STATE_FILE" 2>/dev/null || true

# Debugger LaunchAgent would fight for :9222 — boot it out in cdp mode.
if launchctl print "gui/$(id -u)/com.hermes.chrome-debugger" >/dev/null 2>&1; then
  say "Stopping chrome.debugger bridge (cdp mode owns :9222)…"
  launchctl bootout "gui/$(id -u)/com.hermes.chrome-debugger" 2>/dev/null || true
fi

say "Installing / healing Chrome CDP bridge (port 9222)…"
bash "${REPO_ROOT}/scripts/configure-browser-control.sh" --apply

say "Wiring hermes-agent browser.cdp_url → ws://127.0.0.1:9222…"
bash "${REPO_ROOT}/scripts/wire-hermes-browser-cdp.sh" --url "ws://127.0.0.1:9222"

if [[ -f "${HOME}/Library/LaunchAgents/ai.hermes.gateway.plist" ]]; then
  say "Kickstarting Hermes gateway so it picks up browser.cdp_url…"
  launchctl kickstart -k "gui/$(id -u)/ai.hermes.gateway" 2>/dev/null || true
fi

say "Bridge connected."
echo ""
echo "Paste this into your local agent / Hermes chat to use the bridge:"
echo ""
echo "  Use the local Chrome CDP bridge at ws://127.0.0.1:9222 (browser tools)."
echo "  Open example.com, extract the heading, then stop."
echo ""
echo "Hermes Mobile (real user): Pair this Mac → Chat → Tools → turn on"
echo "Browser Automation → ask Hermes to browse. No adb required."
echo ""
echo "Prefer no Chrome restart? Re-run with --mode=debugger and load the extension."
echo "Status: bash ${REPO_ROOT}/scripts/configure-browser-control.sh --status --json"
echo "Docs:   ${REPO_ROOT}/docs/BROWSER-CONTROL.md"
