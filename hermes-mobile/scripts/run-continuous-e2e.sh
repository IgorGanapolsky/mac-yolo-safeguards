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
LATEST_JSON="${LOG_DIR}/latest.json"
E2E_FLOWS=(
  ".maestro/ship-guard.yaml"
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

wait_for_adb() {
  local attempts="${1:-12}"
  local i=0
  while [[ $i -lt $attempts ]]; do
    local id
    id="$(adb devices 2>/dev/null | awk 'NR>1 && $2=="device" {print $1; exit}')"
    if [[ -n "$id" ]]; then
      echo "$id"
      return 0
    fi
    sleep 5
    i=$((i + 1))
  done
  return 1
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

run_unit_suite() {
  cd "$HERMES_DIR"
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
    xcrun simctl shutdown all 2>/dev/null || true
    sleep 8
    wait_for_adb 3 >/dev/null || true
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

  wait_for_adb 2 >/dev/null || true
  ensure_metro || true

  local flow
  for flow in "${E2E_FLOWS[@]}"; do
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

  {
    echo "=== Hermes Mobile continuous cycle $(timestamp) ==="
    echo "Java: ${JAVA_HOME:-system}"
    echo "Maestro timeout: ${MAESTRO_DRIVER_STARTUP_TIMEOUT}ms"

    if run_unit_suite; then
      unit_status="pass"
      echo "UNIT: PASS"
    else
      detail="unit tests failed"
      echo "UNIT: FAIL"
      write_status "$unit_status" "$e2e_status" "$detail"
      return 1
    fi

    set +e
    run_e2e_suite
    local e2e_rc=$?
    set -e
    case $e2e_rc in
      0) e2e_status="pass"; echo "E2E: PASS" ;;
      2) e2e_status="skipped"; detail="maestro or java unavailable" ;;
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
    run_cycle
    ;;
  --daemon)
    while true; do
      run_cycle || true
      sleep "$INTERVAL"
    done
    ;;
  --watch)
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
