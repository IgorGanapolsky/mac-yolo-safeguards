#!/usr/bin/env bash
# install-browser-bridge.sh — WebBridge-style one-command Local Agent connect.
#
# Steal: Kimi WebBridge's "install + paste one command + agent drives browser in ~1 min".
# Grounded in existing hosting: com.hermes.chrome-cdp + hermes-agent browser tools.
#
#   bash scripts/install-browser-bridge.sh
#   # or from a clone:
#   curl -fsSL https://raw.githubusercontent.com/IgorGanapolsky/mac-yolo-safeguards/main/scripts/install-browser-bridge.sh | bash
#
set -euo pipefail

say() { printf '\033[1;35m▸ %s\033[0m\n' "$1"; }

PROFILE="dedicated"
for arg in "$@"; do
  case "$arg" in
    --profile=daily|daily|--daily) PROFILE="daily" ;;
    --profile=dedicated|dedicated) PROFILE="dedicated" ;;
    --help|-h)
      cat <<'EOF'
Usage: install-browser-bridge.sh [--profile=dedicated|daily]

  dedicated  Hermes-isolated Chrome profile (default; safe)
  daily      Your everyday Chrome profile (keeps logins; quits Chrome first)

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
    scripts/wire-hermes-browser-cdp.sh \
    com.hermes.chrome-cdp.plist; do
    mkdir -p "$DEST/$(dirname "$f")"
    curl -fsSL "$BASE/$f" -o "$DEST/$f"
  done
  chmod +x "$DEST"/scripts/*.sh
  REPO_ROOT="$DEST"
fi

STATE_FILE="${HERMES_BROWSER_BRIDGE_STATE:-$HOME/.hermes/browser-bridge.env}"
mkdir -p "$(dirname "$STATE_FILE")"
if [[ "$PROFILE" == "daily" ]]; then
  export HERMES_CDP_PROFILE="${HERMES_CDP_DAILY_PROFILE:-$HOME/Library/Application Support/Google/Chrome}"
  cat >"$STATE_FILE" <<EOF
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
HERMES_CDP_PROFILE_MODE=dedicated
HERMES_CDP_PROFILE="${HOME}/.hermes/chrome-cdp-profile"
HERMES_CDP_PORT=9222
HERMES_CDP_BIND=127.0.0.1
EOF
  export HERMES_CDP_PROFILE="${HOME}/.hermes/chrome-cdp-profile"
fi
chmod 600 "$STATE_FILE" 2>/dev/null || true

say "Installing / healing Chrome CDP bridge (port 9222)…"
bash "${REPO_ROOT}/scripts/configure-browser-control.sh" --apply

say "Wiring hermes-agent browser.cdp_url → ws://127.0.0.1:9222…"
bash "${REPO_ROOT}/scripts/wire-hermes-browser-cdp.sh" --url "ws://127.0.0.1:9222"

# Best-effort: export for the current shell / gateway restart hint
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
echo "Status: bash ${REPO_ROOT}/scripts/configure-browser-control.sh --status --json"
echo "Docs:   ${REPO_ROOT}/docs/BROWSER-CONTROL.md"
