#!/bin/bash
# Install the local uplink flood/congestion guards without root. The flood
# guard is the bounded mitigator; the congestion sentinel is detection-only.
set -euo pipefail

SCRIPT_DIR=$(cd "$(dirname "$0")" && pwd)
INSTALL_HOME="${UPLINK_GUARD_INSTALL_HOME:-$HOME}"
BIN_DIR="$INSTALL_HOME/.local/bin"
AGENT_DIR="$INSTALL_HOME/Library/LaunchAgents"
LOG_DIR="$INSTALL_HOME/Library/Logs"
DOMAIN="gui/$(id -u)"

mkdir -p "$BIN_DIR" "$AGENT_DIR" "$LOG_DIR"

install_atomic() {
  source_path="$1"; target_path="$2"
  temp_path="${target_path}.$$"
  install -m 755 "$source_path" "$temp_path"
  mv "$temp_path" "$target_path"
}

write_plist() {
  label="$1"; script_path="$2"; stderr_path="$3"; target="$4"
  temp="${target}.$$"
  cat > "$temp" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>${label}</string>
  <key>ProgramArguments</key>
  <array><string>/bin/bash</string><string>${script_path}</string></array>
  <key>EnvironmentVariables</key>
  <dict>
    <key>UPLINK_FLOOD_KBPS_THRESHOLD</key><string>700</string>
    <key>UPLINK_FLOOD_CHRONIC_RUNS</key><string>2</string>
    <key>UPLINK_FLOOD_CHRONIC_RTT_MS</key><string>300</string>
    <key>UPLINK_FLOOD_CHRONIC_PAUSE_SECS</key><string>90</string>
  </dict>
  <key>RunAtLoad</key><true/>
  <key>StartInterval</key><integer>60</integer>
  <key>StandardErrorPath</key><string>${stderr_path}</string>
</dict>
</plist>
EOF
  plutil -lint "$temp" >/dev/null
  chmod 644 "$temp"
  mv "$temp" "$target"
}

FLOOD_BIN="$BIN_DIR/uplink-flood-guard.sh"
SENTINEL_BIN="$BIN_DIR/uplink-congestion-sentinel.sh"
FLOOD_PLIST="$AGENT_DIR/com.igor.uplink-flood-guard.plist"
SENTINEL_PLIST="$AGENT_DIR/com.igor.uplink-congestion-sentinel.plist"

install_atomic "$SCRIPT_DIR/uplink-flood-guard.sh" "$FLOOD_BIN"
install_atomic "$SCRIPT_DIR/uplink-congestion-sentinel.sh" "$SENTINEL_BIN"
write_plist com.igor.uplink-flood-guard "$FLOOD_BIN" "$LOG_DIR/uplink-flood-guard.launchd.err.log" "$FLOOD_PLIST"
write_plist com.igor.uplink-congestion-sentinel "$SENTINEL_BIN" "$LOG_DIR/uplink-congestion-sentinel.launchd.err.log" "$SENTINEL_PLIST"

if [[ "${UPLINK_GUARD_SKIP_LAUNCHCTL:-0}" != "1" ]]; then
  launchctl bootout "$DOMAIN/com.igor.uplink-flood-guard" 2>/dev/null || true
  launchctl bootout "$DOMAIN/com.igor.uplink-congestion-sentinel" 2>/dev/null || true
  launchctl bootstrap "$DOMAIN" "$FLOOD_PLIST"
  launchctl bootstrap "$DOMAIN" "$SENTINEL_PLIST"
  launchctl kickstart "$DOMAIN/com.igor.uplink-flood-guard"
  launchctl kickstart "$DOMAIN/com.igor.uplink-congestion-sentinel"
fi

flood_sha=$(shasum -a 256 "$FLOOD_BIN" | awk '{print $1}')
source_sha=$(shasum -a 256 "$SCRIPT_DIR/uplink-flood-guard.sh" | awk '{print $1}')
[[ "$flood_sha" == "$source_sha" ]] || { echo "uplink guard digest mismatch" >&2; exit 1; }

printf 'uplink guards installed\n'
printf 'flood_sha256=%s\n' "$flood_sha"
printf 'threshold_kbps=700 chronic_runs=2 rtt_ms=300 pause_secs=90\n'
printf 'flood_plist=%s\n' "$FLOOD_PLIST"
printf 'sentinel_plist=%s\n' "$SENTINEL_PLIST"
