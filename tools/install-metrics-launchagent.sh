#!/usr/bin/env bash
# Installs ~/Library/LaunchAgents/com.igor.macyolo.metrics.plist: one metrics snapshot every 600 s.
# Local only. Writes ~/.mac-yolo-safeguards/metrics.jsonl; nothing is sent anywhere.
# Usage: tools/install-metrics-launchagent.sh [repo-root]   (default: the repo this script lives in)
set -euo pipefail
ROOT="${1:-$(cd "$(dirname "$0")/.." && pwd)}"
LABEL="com.igor.macyolo.metrics"
PLIST="$HOME/Library/LaunchAgents/${LABEL}.plist"
NODE="$(command -v node)"
mkdir -p "$HOME/Library/LaunchAgents" "$HOME/.mac-yolo-safeguards"
cat > "$PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>${LABEL}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${NODE}</string>
    <string>${ROOT}/tools/mac-yolo-measure.js</string>
    <string>snapshot</string>
  </array>
  <key>StartInterval</key><integer>600</integer>
  <key>RunAtLoad</key><true/>
  <key>ProcessType</key><string>Background</string>
  <key>Nice</key><integer>10</integer>
  <key>StandardOutPath</key><string>${HOME}/.mac-yolo-safeguards/metrics-agent.log</string>
  <key>StandardErrorPath</key><string>${HOME}/.mac-yolo-safeguards/metrics-agent.err</string>
</dict>
</plist>
EOF
plutil -lint "$PLIST" >/dev/null
launchctl bootout "gui/$(id -u)/${LABEL}" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$PLIST"
echo "Loaded ${LABEL} (every 600 s) -> ${HOME}/.mac-yolo-safeguards/metrics.jsonl"
