#!/usr/bin/env bash
# install-connector.sh — one-command onboarding for the Hermes connector.
# Steals Kimi WebBridge's best idea: "install, paste one command, auto-connects in 1 min."
# The customer runs ONE line; this fetches the connector, pairs it (prints the code to
# approve in the browser dashboard), and installs it as an always-on launchd service so
# it reconnects forever. No inbound ports, no Tailscale.
#
#   curl -fsSL https://<app-domain>/install-connector.sh | bash
#   (or: HERMES_CONTROL_PLANE_URL=https://app.example bash install-connector.sh)
set -euo pipefail

CONTROL_PLANE="${HERMES_CONTROL_PLANE_URL:-https://hermes-agent-control.iganapolsky.chatgpt.site}"
DEST="${HERMES_CONNECTOR_DIR:-$HOME/.hermes/connector}"
CONNECTOR_URL="${HERMES_CONNECTOR_SRC:-https://raw.githubusercontent.com/IgorGanapolsky/mac-yolo-safeguards/main/tools/hermes-cloud-connector.js}"
LABEL="com.hermes.connector"
NODE="$(command -v node || true)"

say(){ printf '\033[1;35m▸ %s\033[0m\n' "$1"; }

[ -n "$NODE" ] || { echo "Node.js is required. Install from https://nodejs.org then re-run."; exit 1; }
mkdir -p "$DEST"

say "Fetching the Hermes connector…"
LOCAL_SRC="${HERMES_CONNECTOR_LOCAL_SRC:-}"
if [ -n "$LOCAL_SRC" ] && [ -f "$LOCAL_SRC" ]; then
  cp "$LOCAL_SRC" "$DEST/hermes-cloud-connector.js"
else
  curl -fsSL "$CONNECTOR_URL" -o "$DEST/hermes-cloud-connector.js"
fi

say "Pairing this machine (approve the code in your dashboard: $CONTROL_PLANE/dashboard)…"
HERMES_CONTROL_PLANE_URL="$CONTROL_PLANE" "$NODE" "$DEST/hermes-cloud-connector.js" pair

# Install an always-on launchd service so the connector reconnects forever (survives
# sleep, network changes, reboots) — pair once, never again.
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
say "Installing always-on service ($LABEL)…"
cat > "$PLIST" <<PLISTEOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key><array>
    <string>$NODE</string><string>$DEST/hermes-cloud-connector.js</string><string>run</string>
  </array>
  <key>EnvironmentVariables</key><dict>
    <key>HERMES_CONTROL_PLANE_URL</key><string>$CONTROL_PLANE</string>
    <key>PATH</key><string>/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin</string>
  </dict>
  <key>KeepAlive</key><true/>
  <key>RunAtLoad</key><true/>
  <key>StandardOutPath</key><string>/tmp/hermes-connector.log</string>
  <key>StandardErrorPath</key><string>/tmp/hermes-connector.log</string>
</dict></plist>
PLISTEOF

launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$PLIST"
say "Done. Your machine is paired and will stay connected automatically."
say "Manage it at $CONTROL_PLANE/dashboard  ·  logs: /tmp/hermes-connector.log"
