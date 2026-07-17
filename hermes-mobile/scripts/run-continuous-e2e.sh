#!/usr/bin/env bash
# Continuous Hermes Mobile verification: unit tests + Maestro E2E (Android USB or iOS sim).
# Modes:
#   --once    single cycle (LaunchAgent default)
#   --daemon  loop forever (local dev)
#   --watch   re-run on src/ changes (debounced)
#   --stop    stop background --daemon process
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HERMES_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
# shellcheck source=maestro-env.sh
source "$SCRIPT_DIR/maestro-env.sh"

MODE="--once"
INTERVAL="${HERMES_E2E_INTERVAL_SEC:-900}"
WATCH_DEBOUNCE="${HERMES_E2E_WATCH_DEBOUNCE_SEC:-45}"
LOG_DIR="${HERMES_E2E_LOG_DIR:-$HERMES_DIR/docs/proofs/continuous}"
PID_FILE="${HOME}/Library/Logs/hermes-mobile-continuous-e2e.pid"
# Exclusive cycle lock — covers --once as well as --daemon (daemon PID_FILE alone
# does not stop concurrent agent --once / LaunchAgent thrash on ADB + Maestro).
CYCLE_LOCK_FILE="${HERMES_E2E_CYCLE_LOCK:-${HOME}/Library/Logs/hermes-mobile-continuous-e2e.lock}"
LATEST_JSON="${LOG_DIR}/latest.json"
PHONE_PIPELINE_TOOL="${HERMES_PHONE_PIPELINE_TOOL:-$(cd "$HERMES_DIR/.." && pwd)/tools/agent-phone-pipeline-lock.js}"
CPU_COUNT="$(sysctl -n hw.ncpu 2>/dev/null || echo 8)"
# Scale with core count (8-core Mac → 8, not 6) so normal dev load does not silently skip E2E.
if [[ -n "${HERMES_E2E_MAX_LOAD:-}" ]]; then
  MAX_LOAD="$HERMES_E2E_MAX_LOAD"
elif (( CPU_COUNT > 6 )); then
  MAX_LOAD="$CPU_COUNT"
else
  MAX_LOAD="6"
fi
LOAD_WAIT_SEC="${HERMES_E2E_LOAD_WAIT_SEC:-900}"
MAX_SIMRUNTIME_PROCS="${HERMES_E2E_MAX_SIMRUNTIME_PROCS:-80}"
E2E_FLOWS=(
  ".maestro/ship-guard.yaml" # includes regression-composer-typeable (#91 keyboard hit-rect)
  ".maestro/chat-send-persistence.yaml"
)

usage() {
  cat <<EOF
Usage: $(basename "$0") [--once|--daemon|--watch|--stop]

  --once     Run one unit + E2E cycle (default)
  --daemon   Loop every HERMES_E2E_INTERVAL_SEC (default 900s)
  --watch    Re-run when hermes-mobile/src changes (debounced)
  --stop     Stop a running --daemon background process

Logs:  ${LOG_DIR}/
Status: ${LATEST_JSON}
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --once|--daemon|--watch|--stop)
      MODE="$1"
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown arg: $1" >&2
      usage >&2
      exit 2
      ;;
  esac
done

timestamp() {
  date -u +"%Y-%m-%dT%H:%M:%SZ"
}

write_status() {
  local unit_status="$1"
  local e2e_status="$2"
  local detail="$3"
  mkdir -p "$LOG_DIR"
  cat >"$LATEST_JSON" <<EOF
{
  "updatedAt": "$(timestamp)",
  "unit": "${unit_status}",
  "e2e": "${e2e_status}",
  "detail": $(python3 -c 'import json,sys; print(json.dumps(sys.argv[1]))' "$detail"),
  "flows": $(python3 -c 'import json,sys; print(json.dumps(sys.argv[1:]))' "${E2E_FLOWS[@]}"),
  "logDir": "${LOG_DIR}"
}
EOF
}

first_android_emulator_id() {
  adb devices 2>/dev/null | awk 'NR>1 && $2=="device" && $1 ~ /^emulator-/ {print $1; exit}'
}

has_android_emulator() {
  local id
  id="$(first_android_emulator_id)"
  [[ -n "$id" ]] && adb -s "$id" shell echo ok >/dev/null 2>&1
}

# Prefer emulator when the USB phone is human-held / awake so LaunchAgent still
# can write e2e=pass|fail instead of perpetual e2e=skipped.
enable_emulator_fallback() {
  local reason="$1"
  local emu_id
  emu_id="$(first_android_emulator_id)"
  if [[ -z "$emu_id" ]] || ! adb -s "$emu_id" shell echo ok >/dev/null 2>&1; then
    return 1
  fi
  export HERMES_E2E_EMULATOR_FALLBACK=1
  export HERMES_E2E_ANDROID_ONLY=1
  export HERMES_E2E_ANDROID_UDID="$emu_id"
  unset HERMES_E2E_IOS_ONLY
  echo "continuous E2E: ${reason} — using Android emulator ${emu_id}"
  return 0
}

guard_active_physical_phone() {
  if [[ "${HERMES_E2E_FORCE:-}" == "1" || "${HERMES_E2E_ALLOW_ACTIVE_PHONE:-}" == "1" ]]; then
    return 0
  fi
  if ! has_usb_adb_device; then
    return 0
  fi

  local rc detail
  set +e
  node "$PHONE_PIPELINE_TOOL" phone-user-active >/dev/null 2>&1
  rc=$?
  set -e
  if [[ $rc -eq 75 ]]; then
    if enable_emulator_fallback "physical phone is awake and actively in use"; then
      return 0
    fi
    detail="skipped continuous E2E: physical phone is awake and actively in use"
    echo "$detail"
    write_status "skipped" "skipped" "$detail"
    return 1
  fi
  if [[ $rc -ne 0 ]]; then
    if enable_emulator_fallback "could not verify exclusive physical-phone access"; then
      return 0
    fi
    detail="skipped continuous E2E: could not verify exclusive physical-phone access"
    echo "$detail"
    write_status "skipped" "skipped" "$detail"
    return 1
  fi
  return 0
}

run_once_with_global_phone_lease() {
  if [[ "${HERMES_PHONE_PIPELINE_LEASE_HELD:-}" == "1" || ! -f "$PHONE_PIPELINE_TOOL" ]]; then
    return 2
  fi
  if ! has_usb_adb_device; then
    return 2
  fi
  if ! guard_active_physical_phone; then
    return 0
  fi
  # Awake-phone path may have switched to emulator — do not take the USB lease.
  if [[ "${HERMES_E2E_EMULATOR_FALLBACK:-}" == "1" ]]; then
    return 2
  fi

  local rc detail
  set +e
  HERMES_PHONE_PIPELINE_LEASE_HELD=1 node "$PHONE_PIPELINE_TOOL" run continuous-e2e -- \
    env HERMES_PHONE_PIPELINE_LEASE_HELD=1 bash "$0" --once
  rc=$?
  set -e
  if [[ $rc -eq 75 ]]; then
    if enable_emulator_fallback "global phone pipeline lease is busy"; then
      return 2
    fi
    detail="skipped continuous E2E: global phone pipeline lease is busy"
    echo "$detail"
    write_status "skipped" "skipped" "$detail"
    return 0
  fi
  return "$rc"
}

load1() {
  uptime | sed -E 's/.*load averages?: ([0-9.]+).*/\1/'
}

number_gt() {
  awk -v left="$1" -v right="$2" 'BEGIN { exit !(left > right) }'
}

simruntime_process_count() {
  pgrep -f 'CoreSimulator/Volumes/iOS_.*\.simruntime' 2>/dev/null | wc -l | tr -d ' '
}

guard_system_pressure() {
  if [[ "${HERMES_E2E_FORCE:-}" == "1" ]]; then
    return 0
  fi

  local current_load current_sim_count detail lease_reason

  # Unified global phone device lease (T-330 priority 2): E2E must skip — never queue —
  # when a human is holding the phone, and must also respect a live pairing/install lane.
  # phone_lease_busy_reason (agent-phone-lease.js) ignores its own ancestor's mkdir lock
  # when HERMES_PHONE_PIPELINE_LEASE_HELD=1 (run_once_with_global_phone_lease already
  # holds it for this whole process tree) while still honoring a human hold mid-cycle.
  lease_reason="$(phone_lease_busy_reason)"
  if [[ -n "$lease_reason" ]]; then
    detail="skipped continuous E2E: phone lease busy (${lease_reason})"
    echo "$detail"
    write_status "skipped" "skipped" "$detail"
    return 1
  fi

  current_load="$(load1)"
  current_sim_count="$(simruntime_process_count)"

  if number_gt "$current_load" "$MAX_LOAD"; then
    local deadline=$((SECONDS + LOAD_WAIT_SEC))
    echo "Load ${current_load} exceeds max ${MAX_LOAD} — queueing up to ${LOAD_WAIT_SEC}s (HERMES_E2E_FORCE=1 to bypass)"
    while number_gt "$(load1)" "$MAX_LOAD"; do
      if (( SECONDS >= deadline )); then
        detail="skipped continuous E2E after ${LOAD_WAIT_SEC}s wait: load $(load1) still exceeds max ${MAX_LOAD}; set HERMES_E2E_FORCE=1 to override"
        echo "$detail"
        write_status "skipped" "skipped" "$detail"
        return 1
      fi
      sleep 30
    done
    echo "Load dropped to $(load1) — proceeding with continuous E2E"
  fi

  if [[ "$current_sim_count" =~ ^[0-9]+$ ]] && (( current_sim_count > MAX_SIMRUNTIME_PROCS )); then
    detail="skipped continuous E2E: simruntime process count ${current_sim_count} exceeds max ${MAX_SIMRUNTIME_PROCS}"
    echo "$detail"
    write_status "skipped" "skipped" "$detail"
    return 1
  fi

  return 0
}

wait_for_adb() {
  local attempts="${1:-12}"
  local i=0
  while [[ $i -lt $attempts ]]; do
    local id
    id="$(adb devices 2>/dev/null | awk 'NR>1 && $2=="device" && $1 !~ /^emulator-/ {print $1; exit}')"
    if [[ -n "$id" ]] && adb -s "$id" shell echo ok >/dev/null 2>&1; then
      echo "$id"
      return 0
    fi
    sleep 5
    i=$((i + 1))
  done
  return 1
}

has_usb_adb_device() {
  if [[ "${HERMES_E2E_IOS_ONLY:-}" == "1" ]]; then
    return 1
  fi
  # Emulator-fallback mode must ignore the USB phone so Maestro targets the AVD.
  if [[ "${HERMES_E2E_EMULATOR_FALLBACK:-}" == "1" ]]; then
    return 1
  fi
  local id
  id="$(adb devices 2>/dev/null | awk 'NR>1 && $2=="device" && $1 !~ /^emulator-/ {print $1; exit}')"
  [[ -n "$id" ]] && adb -s "$id" shell echo ok >/dev/null 2>&1
}

has_adb_device() {
  has_usb_adb_device || has_android_emulator
}

ensure_metro() {
  if curl -sf "http://127.0.0.1:8081/status" >/dev/null 2>&1; then
    echo "metro=running"
    return 0
  fi
  echo "Starting Metro on :8081..."
  mkdir -p "$LOG_DIR"
  (
    cd "$HERMES_DIR"
    nohup npx expo start --port 8081 >>"$LOG_DIR/metro.log" 2>&1 &
  )
  local i=0
  while [[ $i -lt 45 ]]; do
    if curl -sf "http://127.0.0.1:8081/status" >/dev/null 2>&1; then
      echo "metro=started"
      return 0
    fi
    sleep 2
    i=$((i + 1))
  done
  echo "metro=unavailable" >&2
  return 1
}

# True when hermes-mobile has a usable local Jest (worktrees without node_modules
# must not run continuous — they used to write unit:fail and poison latest.json).
jest_available() {
  [[ -x "${HERMES_DIR}/node_modules/.bin/jest" ]] \
    || [[ -f "${HERMES_DIR}/node_modules/jest/bin/jest.js" ]]
}

# Another Maestro CLI holds the device/simulator — second continuous must not stack.
maestro_cli_busy() {
  # Match only the Java maestro.cli process, not bash monitors that mention the string.
  # Avoid pipefail on empty grep: status 1 = free, 0 = busy.
  if ps -axo command= 2>/dev/null | grep -E 'java .*maestro\.cli\.AppKt' >/dev/null 2>&1; then
    return 0
  fi
  return 1
}

acquire_cycle_lock() {
  mkdir -p "$(dirname "$CYCLE_LOCK_FILE")"
  # FD 9 held for process lifetime; released on exit.
  exec 9>"$CYCLE_LOCK_FILE"
  if ! flock -n 9; then
    local holder=""
    if [[ -f "${CYCLE_LOCK_FILE}.pid" ]]; then
      holder=" (holder pid $(cat "${CYCLE_LOCK_FILE}.pid" 2>/dev/null || echo '?'))"
    fi
    echo "Continuous E2E cycle lock busy${holder} — refusing second instance (protects ADB/Maestro)."
    echo "Lock: ${CYCLE_LOCK_FILE}"
    # Do not overwrite latest.json — the holder owns the proof file.
    exit 0
  fi
  echo $$ >"${CYCLE_LOCK_FILE}.pid"
  # shellcheck disable=SC2064
  trap 'rm -f "${CYCLE_LOCK_FILE}.pid"' EXIT
}

run_unit_suite() {
  cd "$HERMES_DIR"
  if ! jest_available; then
    echo "jest not installed under ${HERMES_DIR} (missing node_modules)." >&2
    echo "Refusing continuous unit suite so latest.json is not polluted with unit:fail." >&2
    echo "Fix: run from hermes-mobile with node_modules, or npm ci in this worktree." >&2
    return 3
  fi
  npm test -- --no-coverage --watchman=false
  npm run test:release-safety
}

run_e2e_flow() {
  local flow="$1"
  local max_attempts=3
  local attempt=1
  while [[ $attempt -le $max_attempts ]]; do
    echo "E2E ${flow} (attempt ${attempt}/${max_attempts})..."
    if bash "$SCRIPT_DIR/run-e2e.sh" "$flow"; then
      return 0
    fi
    echo "E2E attempt ${attempt} failed for ${flow}" >&2
    attempt=$((attempt + 1))
    # Do not tear down iOS simulators while a USB Android device is connected — that
    # race caused Maestro to fall back to simulator mid-cycle.
    if has_usb_adb_device; then
      sleep 8
      wait_for_adb 12 >/dev/null || true
    else
      xcrun simctl shutdown all 2>/dev/null || true
    fi
    sleep 8
    wait_for_adb 6 >/dev/null || true
  done
  return 1
}

run_e2e_suite() {
  if ! command -v maestro >/dev/null 2>&1; then
    echo "Maestro not installed — skipping E2E"
    return 2
  fi
  if ! java -version >/dev/null 2>&1; then
    echo "Java not available — skipping E2E"
    return 2
  fi

  if has_usb_adb_device; then
    echo "E2E target: Android USB ($(adb devices 2>/dev/null | awk 'NR>1 && $2=="device" && $1 !~ /^emulator-/ {print $1; exit}'))"
  elif has_android_emulator; then
    local emu_id
    emu_id="$(first_android_emulator_id)"
    echo "E2E target: Android emulator (${emu_id})"
    export HERMES_E2E_EMULATOR_FALLBACK=1
    export HERMES_E2E_ANDROID_ONLY=1
    export HERMES_E2E_ANDROID_UDID="$emu_id"
    unset HERMES_E2E_IOS_ONLY
  elif [[ "${HERMES_E2E_ANDROID_ONLY:-}" == "1" ]]; then
    echo "Android-only continuous E2E requested but no USB Android device or emulator is connected — skipping E2E"
    return 2
  elif ! xcrun simctl list devices available 2>/dev/null | grep -qE 'iPhone.*\([0-9A-F-]{36}\)'; then
    echo "No Android USB device and no iOS simulator — skipping E2E"
    return 2
  else
    echo "E2E target: iOS simulator (no USB Android device)"
  fi

  wait_for_adb 2 >/dev/null || true
  ensure_metro || true

  if has_usb_adb_device; then
    export HERMES_E2E_ANDROID_ONLY=1
    export HERMES_E2E_ANDROID_UDID="$(adb devices 2>/dev/null | awk 'NR>1 && $2=="device" && $1 !~ /^emulator-/ {print $1; exit}')"
    unset HERMES_E2E_IOS_ONLY
  elif [[ "${HERMES_E2E_EMULATOR_FALLBACK:-}" == "1" ]] || has_android_emulator; then
    export HERMES_E2E_ANDROID_ONLY=1
    export HERMES_E2E_ANDROID_UDID="${HERMES_E2E_ANDROID_UDID:-$(first_android_emulator_id)}"
    unset HERMES_E2E_IOS_ONLY
  else
    unset HERMES_E2E_ANDROID_ONLY HERMES_E2E_ANDROID_UDID
    export HERMES_E2E_IOS_ONLY=1
  fi

  local flow
  local first=1
  for flow in "${E2E_FLOWS[@]}"; do
    # Settle ADB/Maestro between flows — stacking ship-guard → chat-send without
    # a pause was causing AdbSocket connect failures and empty Maestro logs.
    if [[ $first -eq 0 ]] && has_usb_adb_device; then
      echo "Settling ADB 12s between Maestro flows..."
      sleep 12
      wait_for_adb 12 >/dev/null || true
    fi
    first=0
    if ! run_e2e_flow "$flow"; then
      return 1
    fi
  done
  return 0
}

run_cycle() {
  local cycle_log="${LOG_DIR}/run-$(date +%Y%m%d-%H%M%S).log"
  mkdir -p "$LOG_DIR"
  local unit_status="fail"
  local e2e_status="skipped"
  local detail=""

  if ! guard_system_pressure; then
    return 0
  fi

  # Hard preflight: bare worktree without node_modules must not poison shared latest.json.
  if ! jest_available; then
    echo "=== Hermes Mobile continuous cycle $(timestamp) ===" | tee -a "$cycle_log"
    echo "SKIP: jest missing under ${HERMES_DIR} — not writing latest.json" | tee -a "$cycle_log"
    return 0
  fi

  # If another agent already has Maestro mid-flow, wait briefly then skip E2E (keep unit).
  if maestro_cli_busy && [[ "${HERMES_E2E_FORCE:-}" != "1" ]]; then
    local wait_i=0
    echo "Maestro CLI already running — waiting up to 90s for exclusive device access..."
    while [[ $wait_i -lt 9 ]] && maestro_cli_busy; do
      sleep 10
      wait_i=$((wait_i + 1))
    done
    if maestro_cli_busy; then
      echo "Maestro still busy — skipping E2E this cycle (another continuous holds device)"
      # Still run unit so agents get a fresh unit signal without thrashing ADB.
    fi
  fi

  {
    echo "=== Hermes Mobile continuous cycle $(timestamp) ==="
    echo "Java: ${JAVA_HOME:-system}"
    echo "Maestro timeout: ${MAESTRO_DRIVER_STARTUP_TIMEOUT}ms"
    echo "Cycle lock: ${CYCLE_LOCK_FILE} (pid $$)"

    set +e
    run_unit_suite
    local unit_rc=$?
    set -e
    if [[ $unit_rc -eq 0 ]]; then
      unit_status="pass"
      echo "UNIT: PASS"
    elif [[ $unit_rc -eq 3 ]]; then
      # jest missing — should have been caught above; never write unit:fail
      echo "UNIT: SKIP (jest missing)"
      return 0
    else
      detail="unit tests failed"
      echo "UNIT: FAIL"
      write_status "$unit_status" "$e2e_status" "$detail"
      return 1
    fi

    if maestro_cli_busy && [[ "${HERMES_E2E_FORCE:-}" != "1" ]]; then
      e2e_status="skipped"
      detail="skipped: another maestro.cli.AppKt process holds the device"
      write_status "$unit_status" "$e2e_status" "$detail"
      echo "E2E: SKIPPED (${detail})"
      echo "Status written to ${LATEST_JSON}"
      return 0
    fi

    set +e
    run_e2e_suite
    local e2e_rc=$?
    set -e
    case $e2e_rc in
      0) e2e_status="pass"; echo "E2E: PASS" ;;
      2)
        if [[ "${HERMES_E2E_ANDROID_ONLY:-}" == "1" ]] && ! has_usb_adb_device && ! has_android_emulator; then
          e2e_status="fail"
          detail="android-only continuous E2E failed: no USB Android device connected"
        else
          e2e_status="skipped"
          detail="maestro or java unavailable"
        fi
        ;;
      *) e2e_status="fail"; detail="one or more Maestro flows failed" ;;
    esac

    write_status "$unit_status" "$e2e_status" "$detail"
    echo "Status written to ${LATEST_JSON}"
    [[ "$e2e_status" == "fail" ]] && return 1
    return 0
  } 2>&1 | tee "$cycle_log"
}

start_daemon() {
  if [[ -f "$PID_FILE" ]] && kill -0 "$(cat "$PID_FILE")" 2>/dev/null; then
    echo "Continuous E2E daemon already running (pid $(cat "$PID_FILE"))"
    exit 0
  fi
  mkdir -p "$(dirname "$PID_FILE")"
  nohup "$0" --daemon >>"${HOME}/Library/Logs/hermes-mobile-continuous-e2e.log" 2>&1 &
  echo $! >"$PID_FILE"
  echo "Started continuous E2E daemon pid $(cat "$PID_FILE") (interval ${INTERVAL}s)"
}

stop_daemon() {
  if [[ ! -f "$PID_FILE" ]]; then
    echo "No pid file — daemon not running"
    exit 0
  fi
  local pid
  pid="$(cat "$PID_FILE")"
  if kill -0 "$pid" 2>/dev/null; then
    kill "$pid" 2>/dev/null || true
    echo "Stopped continuous E2E daemon pid ${pid}"
  else
    echo "Stale pid file (pid ${pid} not running)"
  fi
  rm -f "$PID_FILE"
}

watch_loop() {
  echo "Watching ${HERMES_DIR}/src for changes (debounce ${WATCH_DEBOUNCE}s)..."
  local last_run=0
  local last_hash=""
  while true; do
    local hash
    hash="$(find "${HERMES_DIR}/src" -type f -name '*.ts' -o -name '*.tsx' 2>/dev/null | sort | xargs stat -f '%m %N' 2>/dev/null | shasum -a 256 | awk '{print $1}')"
    local now
    now="$(date +%s)"
    if [[ -n "$hash" && "$hash" != "$last_hash" && $((now - last_run)) -ge $WATCH_DEBOUNCE ]]; then
      last_hash="$hash"
      last_run="$now"
      run_cycle || true
    fi
    sleep 10
  done
}

case "$MODE" in
  --once)
    # Skip the USB phone lease when we already know we will use the emulator
    # (human-held phone, or explicit fallback). Emulator runs must not block on
    # the phone pipeline lock held by session-start install/pair.
    if [[ "${HERMES_PHONE_PIPELINE_LEASE_HELD:-}" != "1" && "${HERMES_E2E_EMULATOR_FALLBACK:-}" != "1" ]] && has_usb_adb_device; then
      # Probe awake-phone before taking the lease; fall through to emulator if needed.
      if ! guard_active_physical_phone; then
        exit 0
      fi
      if [[ "${HERMES_E2E_EMULATOR_FALLBACK:-}" == "1" ]]; then
        acquire_cycle_lock
        run_cycle
        exit $?
      fi
      set +e
      run_once_with_global_phone_lease
      lease_rc=$?
      set -e
      # 2 = fall through (emulator fallback or lease tool unavailable)
      if [[ $lease_rc -ne 2 ]]; then
        exit "$lease_rc"
      fi
      if [[ "${HERMES_E2E_EMULATOR_FALLBACK:-}" == "1" ]]; then
        acquire_cycle_lock
        run_cycle
        exit $?
      fi
    fi
    acquire_cycle_lock
    run_cycle
    ;;
  --daemon)
    acquire_cycle_lock
    while true; do
      run_cycle || true
      sleep "$INTERVAL"
    done
    ;;
  --watch)
    acquire_cycle_lock
    watch_loop
    ;;
  --stop)
    stop_daemon
    ;;
  *)
    usage >&2
    exit 2
    ;;
esac
