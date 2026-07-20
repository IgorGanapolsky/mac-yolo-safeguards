#!/usr/bin/env bash
# install-connector.sh — one-command onboarding for the Hermes connector.
# The customer runs one line; this fetches the connector, opens a browser with the
# short pairing code already filled, and installs an always-on launchd service.
# The local Hermes gateway credential is read from ~/.hermes/.env and is never copied
# into ThumbGate config, the launchd plist, command arguments, or logs.
#
#   curl -fsSL https://<app-domain>/install-connector.sh | bash
#   (or: HERMES_CONTROL_PLANE_URL=https://app.example bash install-connector.sh)
set -euo pipefail

CONTROL_PLANE="${HERMES_CONTROL_PLANE_URL:-https://thumbgate.app}"
DEST="${HERMES_CONNECTOR_DIR:-$HOME/.hermes/connector}"
CONFIG="${HERMES_CONNECTOR_CONFIG:-$HOME/.hermes/cloud-connector.json}"
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
chmod 700 "$DEST/hermes-cloud-connector.js"

if [ -f "$CONFIG" ] && "$NODE" -e 'const fs=require("fs");const config=JSON.parse(fs.readFileSync(process.argv[1],"utf8"));process.exit(config.deviceId?0:1)' "$CONFIG"; then
  say "Reusing this machine's existing signed ThumbGate pairing."
else
  say "Opening ThumbGate so you can approve this machine…"
  HERMES_CONNECTOR_CONFIG="$CONFIG" HERMES_CONTROL_PLANE_URL="$CONTROL_PLANE" "$NODE" "$DEST/hermes-cloud-connector.js" --pair --pair-only
fi

# Install an always-on launchd service so the connector reconnects forever (survives
# sleep, network changes, reboots) — pair once, never again.
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
mkdir -p "$HOME/Library/LaunchAgents"
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
    <key>HERMES_CONNECTOR_CONFIG</key><string>$CONFIG</string>
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
say "Connected. ThumbGate is syncing your recent Hermes chats now."
say "Manage it at $CONTROL_PLANE/dashboard  ·  logs: /tmp/hermes-connector.log"
