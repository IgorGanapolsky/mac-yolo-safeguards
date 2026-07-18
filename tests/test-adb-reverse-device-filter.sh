#!/bin/sh
set -eu

REPO="$(cd "$(dirname "$0")/.." && pwd)"
GUARD="$REPO/sim-runaway-guard.sh"
TMP="$(mktemp -d /tmp/yolo-adb-reverse-test.XXXXXX)"
trap 'rm -rf "$TMP"' EXIT INT TERM

CALLS="$TMP/adb-calls.log"
FAKE_ADB="$TMP/adb"
cat > "$FAKE_ADB" <<'EOF'
#!/bin/sh
if [ "$#" -eq 1 ] && [ "$1" = "devices" ]; then
  cat <<'DEVICES'
List of devices attached
R3PHYSICAL123 device
emulator-5554 device
OFFLINE123 offline
DEVICES
  exit 0
fi

printf '%s\n' "$*" >> "$ADB_CALLS"
if [ "$#" -eq 4 ] && [ "$1" = "-s" ] && [ "$2" = "emulator-5554" ] \
  && [ "$3" = "reverse" ] && [ "$4" = "--list" ]; then
  printf 'host-17 tcp:8642 tcp:8642\nhost-17 tcp:8765 tcp:8765\n'
fi
exit 0
EOF
chmod +x "$FAKE_ADB"

# Keep this test independent of the global E2E lease. A concurrent runner can
# hold /tmp/yolo-guard-e2e.pid, which correctly pauses the real guard but would
# otherwise exit this isolated fake-ADB run before recording any calls.
E2E_LEASE_FILE="$TMP/yolo-guard-e2e.pid"

ADB_CALLS="$CALLS" \
YOLO_ADB_BIN="$FAKE_ADB" \
YOLO_LOG="$TMP/guard.log" \
YOLO_FIRES_LOG="$TMP/fires.log" \
YOLO_E2E_LEASE_FILE="$E2E_LEASE_FILE" \
YOLO_CPU_STATE_FILE="$TMP/cpu-state" \
YOLO_CPU_LAST_FILE="$TMP/cpu-last" \
YOLO_CPU_STATUS_FILE="$TMP/cpu-status.txt" \
YOLO_CODEQL_STATE_FILE="$TMP/codeql-state" \
YOLO_BOOTED_SIM_STATE_FILE="$TMP/booted-sim-state" \
YOLO_PAGEOUT_STATE_FILE="$TMP/pageouts" \
YOLO_MEM_LAST_FILE="$TMP/mem-last" \
YOLO_STATUS_FILE="$TMP/status.txt" \
YOLO_MEM_APP_LAST_FILE="$TMP/mem-app-last" \
YOLO_MEM_APP_STATUS_FILE="$TMP/mem-app-status.txt" \
YOLO_WEBHOOK_URL="http://127.0.0.1:9" \
YOLO_SIM_PROC_HARD_LIMIT=99999 \
YOLO_SIM_LOAD_THRESHOLD=99999 \
YOLO_SIM_MEM_LIMIT=99999 \
YOLO_BOOTED_SIM_LOAD_THRESHOLD=99999 \
YOLO_CPU_PCT_THRESHOLD=99999 \
YOLO_CODEQL_CPU_PCT_THRESHOLD=99999 \
YOLO_MEM_FREE_PCT_THRESHOLD=0 \
YOLO_SWAP_PCT_THRESHOLD=999 \
YOLO_RECLAIM_OLLAMA=0 \
YOLO_RECLAIM_STALE_CDP=0 \
YOLO_RECLAIM_SECONDARY_BROWSERS=0 \
/bin/sh "$GUARD" >/dev/null 2>&1

assert_call() {
  expected="$1"
  if ! /usr/bin/grep -Fqx -- "$expected" "$CALLS"; then
    echo "missing adb call: $expected" >&2
    cat "$CALLS" >&2
    exit 1
  fi
}

assert_call "-s R3PHYSICAL123 reverse tcp:8642 tcp:8642"
assert_call "-s R3PHYSICAL123 reverse tcp:8765 tcp:8765"
assert_call "-s emulator-5554 reverse --remove tcp:8642"
assert_call "-s emulator-5554 reverse --remove tcp:8765"

if /usr/bin/grep -Fq -- "-s emulator-5554 reverse tcp:" "$CALLS"; then
  echo "guard added reverse forwarding to an emulator" >&2
  cat "$CALLS" >&2
  exit 1
fi
if /usr/bin/grep -Fq -- "OFFLINE123" "$CALLS"; then
  echo "guard touched an offline device" >&2
  cat "$CALLS" >&2
  exit 1
fi

cleanup_count=$(/usr/bin/grep -c 'ADB_REVERSE_CLEANUP: removed tcp:' "$TMP/guard.log")
if [ "$cleanup_count" -ne 2 ]; then
  echo "expected two emulator cleanup log entries, got $cleanup_count" >&2
  cat "$TMP/guard.log" >&2
  exit 1
fi

echo "adb reverse device filter: 7 assertions passed"
