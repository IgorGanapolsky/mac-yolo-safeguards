#!/bin/bash
set -euo pipefail

REPO_ROOT=$(cd "$(dirname "$0")/.." && pwd)
GUARD="$REPO_ROOT/scripts/uplink-flood-guard.sh"
INSTALLER="$REPO_ROOT/scripts/install-uplink-guards.sh"
TMP=$(mktemp -d "${TMPDIR:-/tmp}/uplink-guard-test.XXXXXX")
cleanup() {
  for job in $(jobs -pr); do
    kill "$job" 2>/dev/null || true
    wait "$job" 2>/dev/null || true
  done
  rm -rf "$TMP"
}
trap cleanup EXIT

FAKE_BIN="$TMP/bin"
mkdir -p "$FAKE_BIN" "$TMP/home/Library/Logs"

cat > "$FAKE_BIN/nettop" <<'EOF'
#!/bin/bash
pid=${FAKE_TALKER_PID:?}
name=${FAKE_TALKER_NAME:-grok-1.0.6}
bytes=${FAKE_BYTES_OUT:-8000000}
retx=${FAKE_RETX:-1200}
printf ',bytes_out,re-tx\n%s.%s,0,0\n,bytes_out,re-tx\n%s.%s,%s,%s\n' "$name" "$pid" "$name" "$pid" "$bytes" "$retx"
EOF
cat > "$FAKE_BIN/ping" <<'EOF'
#!/bin/bash
rtt=${FAKE_RTT_MS:-700}
printf 'round-trip min/avg/max/stddev = %s/%s/%s/0.1 ms\n' "$rtt" "$rtt" "$rtt"
EOF
cat > "$FAKE_BIN/lsof" <<'EOF'
#!/bin/bash
[[ "${FAKE_SCREEN_SHARE:-0}" == "1" ]] && printf 'screensharingd ESTABLISHED\n'
exit 0
EOF
cat > "$FAKE_BIN/signal-recorder" <<'EOF'
#!/bin/bash
printf '%s %s\n' "$1" "$2" >> "${FAKE_SIGNAL_LOG:?}"
EOF
cat > "$FAKE_BIN/curl" <<'EOF'
#!/bin/bash
exit 0
EOF
chmod +x "$FAKE_BIN"/*

sleep 120 &
TALKER_PID=$!

export PATH="$FAKE_BIN:/usr/bin:/bin:/usr/sbin:/sbin"
export HOME="$TMP/home"
export FAKE_TALKER_PID="$TALKER_PID"
export FAKE_SIGNAL_LOG="$TMP/signals.log"
export UPLINK_GUARD_SIGNAL_CMD="$FAKE_BIN/signal-recorder"
export UPLINK_GUARD_DISABLE_NOTIFY=1
export UPLINK_GUARD_SAMPLE_SECS=10
export UPLINK_GUARD_LOG="$TMP/guard.log"
export UPLINK_GUARD_STATE="$TMP/paused.state"
export UPLINK_GUARD_CHRONIC_FILE="$TMP/chronic.state"
export UPLINK_GUARD_COOLDOWN_FILE="$TMP/cooldown.state"
export UPLINK_GUARD_CHRONIC_NOTIFY_FILE="$TMP/chronic-notify.state"
export UPLINK_FLOOD_KBPS_THRESHOLD=700
export UPLINK_FLOOD_RETX_THRESHOLD=500
export UPLINK_FLOOD_CHRONIC_RUNS=2
export UPLINK_FLOOD_CHRONIC_RTT_MS=300
export UPLINK_FLOOD_CHRONIC_PAUSE_SECS=90

reset_case() {
  rm -f "$UPLINK_GUARD_STATE" "$UPLINK_GUARD_CHRONIC_FILE" "$FAKE_SIGNAL_LOG" "$UPLINK_GUARD_LOG"
  export FAKE_TALKER_NAME=grok-1.0.6
  export FAKE_BYTES_OUT=8000000
  export FAKE_RETX=1200
  export FAKE_RTT_MS=700
  export FAKE_SCREEN_SHARE=0
  export UPLINK_GUARD_NOW_EPOCH=1000
}

fail() { echo "FAIL: $*" >&2; exit 1; }
pass() { echo "PASS: $*"; }

reset_case
FAKE_BYTES_OUT=6000000 "$GUARD"
[[ ! -e "$UPLINK_GUARD_CHRONIC_FILE" ]] || fail 'below-threshold traffic started chronic state'
[[ ! -e "$FAKE_SIGNAL_LOG" ]] || fail 'below-threshold traffic signaled a process'
pass 'below-threshold traffic is untouched'

reset_case
"$GUARD"
UPLINK_GUARD_NOW_EPOCH=1060 "$GUARD"
grep -q "STOP $TALKER_PID" "$FAKE_SIGNAL_LOG" || fail 'second degraded flood did not STOP the agent'
[[ -s "$UPLINK_GUARD_STATE" ]] || fail 'pause state missing after STOP'
grep -q 'chronic' "$UPLINK_GUARD_STATE" || fail 'pause state does not identify chronic mode'
pass 'two degraded floods create a bounded chronic pause'

UPLINK_GUARD_NOW_EPOCH=1100 "$GUARD"
[[ $(wc -l < "$FAKE_SIGNAL_LOG") -eq 1 ]] || fail 'agent resumed before pause deadline'
UPLINK_GUARD_NOW_EPOCH=1160 "$GUARD"
grep -q "CONT $TALKER_PID" "$FAKE_SIGNAL_LOG" || fail 'same process identity was not resumed'
[[ ! -e "$UPLINK_GUARD_STATE" ]] || fail 'pause state survived successful resume'
pass 'bounded pause auto-resumes the exact process identity'

reset_case
"$GUARD"
UPLINK_GUARD_NOW_EPOCH=1060 "$GUARD"
stored_identity=$(awk '{print $5}' "$UPLINK_GUARD_STATE")
printf '%s %s chronic 1090 %s\n' "$TALKER_PID" grok-1.0.6 "$((stored_identity + 1))" > "$UPLINK_GUARD_STATE"
UPLINK_GUARD_NOW_EPOCH=1160 "$GUARD"
[[ $(grep -c '^CONT ' "$FAKE_SIGNAL_LOG" 2>/dev/null || true) -eq 0 ]] || fail 'PID-reuse identity mismatch received CONT'
grep -q 'identity changed' "$UPLINK_GUARD_LOG" || fail 'PID-reuse refusal was not logged'
pass 'PID reuse fails closed without resuming an unrelated process'

reset_case
FAKE_TALKER_NAME=Photos "$GUARD"
FAKE_TALKER_NAME=Photos UPLINK_GUARD_NOW_EPOCH=1060 "$GUARD"
[[ ! -e "$FAKE_SIGNAL_LOG" ]] || fail 'non-agent process was signaled'
pass 'non-agent uploader is never paused'

reset_case
"$GUARD" --dry-run
UPLINK_GUARD_NOW_EPOCH=1060 "$GUARD" --dry-run
[[ ! -e "$FAKE_SIGNAL_LOG" ]] || fail 'dry-run signaled a process'
grep -q 'DRY-RUN: would chronic-SIGSTOP' "$UPLINK_GUARD_LOG" || fail 'dry-run did not prove chronic decision'
pass 'dry-run records the action without signaling'

INSTALL_HOME="$TMP/install-home"
UPLINK_GUARD_INSTALL_HOME="$INSTALL_HOME" UPLINK_GUARD_SKIP_LAUNCHCTL=1 "$INSTALLER" > "$TMP/install.out"
cmp -s "$GUARD" "$INSTALL_HOME/.local/bin/uplink-flood-guard.sh" || fail 'installer changed guard bytes'
plutil -lint "$INSTALL_HOME/Library/LaunchAgents/com.igor.uplink-flood-guard.plist" >/dev/null
plutil -lint "$INSTALL_HOME/Library/LaunchAgents/com.igor.uplink-congestion-sentinel.plist" >/dev/null
grep -q '<string>700</string>' "$INSTALL_HOME/Library/LaunchAgents/com.igor.uplink-flood-guard.plist" || fail 'installed plist omitted threshold'
pass 'installer preserves exact bytes and valid 60-second LaunchAgents'

echo 'PASS: uplink flood guard suite'
