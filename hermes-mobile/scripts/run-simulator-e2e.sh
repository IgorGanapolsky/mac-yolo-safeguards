#!/usr/bin/env bash
# Boot iOS simulator (if needed), ensure Metro-friendly dev client, run full Maestro suite.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HERMES_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
# shellcheck source=maestro-env.sh
source "$SCRIPT_DIR/maestro-env.sh"

DEFAULT_SIM_NAME="${HERMES_SIM_NAME:-iPhone 17 Pro}"
MAESTRO_READY_TIMEOUT_SEC="${MAESTRO_READY_TIMEOUT_SEC:-120}"
FLOW="${1:-.maestro/full-suite.yaml}"

wait_for_simulator_boot() {
  local udid="$1"
  echo "Waiting for simulator boot (bootstatus, up to ${MAESTRO_READY_TIMEOUT_SEC}s)..." >&2
  xcrun simctl bootstatus "$udid" -b >&2 &
  local pid=$!
  local elapsed=0
  while kill -0 "$pid" 2>/dev/null; do
    if [[ $elapsed -ge $MAESTRO_READY_TIMEOUT_SEC ]]; then
      kill "$pid" 2>/dev/null || true
      wait "$pid" 2>/dev/null || true
      echo "Simulator boot timed out after ${MAESTRO_READY_TIMEOUT_SEC}s" >&2
      return 1
    fi
    sleep 2
    elapsed=$((elapsed + 2))
  done
  wait "$pid"
}

wait_for_maestro_ios_device() {
  local udid="$1"
  echo "Polling Maestro for iOS device (up to ${MAESTRO_READY_TIMEOUT_SEC}s)..." >&2
  local elapsed=0
  local interval=3
  while [[ $elapsed -lt $MAESTRO_READY_TIMEOUT_SEC ]]; do
    if xcrun simctl list devices booted 2>/dev/null | grep -Fq "$udid"; then
      if maestro list-devices 2>/dev/null | grep -Fqi 'iPhone'; then
        echo "Maestro sees iOS simulator (${elapsed}s)" >&2
        return 0
      fi
    fi
    sleep "$interval"
    elapsed=$((elapsed + interval))
  done
  echo "Maestro iOS device poll timed out after ${MAESTRO_READY_TIMEOUT_SEC}s" >&2
  return 1
}

if ! command -v maestro >/dev/null 2>&1; then
  echo "Maestro required: curl -fsSL https://get.maestro.mobile.dev | bash" >&2
  exit 1
fi

if ! java -version >/dev/null 2>&1; then
  echo "Java runtime required for Maestro (brew install openjdk@17)" >&2
  exit 1
fi

resolve_sim_udid() {
  local booted
  booted="$(xcrun simctl list devices booted 2>/dev/null | grep -Eo '[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}' | head -1 || true)"
  if [ -n "$booted" ]; then
    echo "$booted"
    return
  fi
  local udid
  udid="$(xcrun simctl list devices available 2>/dev/null | grep "$DEFAULT_SIM_NAME (" | head -1 | grep -Eo '[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}' || true)"
  if [ -z "$udid" ]; then
    echo "No simulator named '$DEFAULT_SIM_NAME' found." >&2
    exit 1
  fi
  echo "Booting $DEFAULT_SIM_NAME ($udid)..." >&2
  xcrun simctl boot "$udid" || true
  open -a Simulator || true
  wait_for_simulator_boot "$udid"
  echo "$udid"
}

UDID="$(resolve_sim_udid)"
echo "=== Hermes Mobile iOS Simulator E2E ==="
echo "Simulator: $UDID"
echo "Flow:      $FLOW"
echo "Java:      ${JAVA_HOME:-system}"
echo "Maestro driver timeout: ${MAESTRO_DRIVER_STARTUP_TIMEOUT}ms"

if curl -sf "http://127.0.0.1:8081/status" >/dev/null 2>&1; then
  echo "Metro:     running on :8081 (dev client will load latest JS)"
else
  echo "Metro:     not detected on :8081 — install may use embedded bundle only" >&2
fi

open -a Simulator >/dev/null 2>&1 || true
wait_for_maestro_ios_device "$UDID"

cd "$HERMES_DIR"
maestro test -p ios --udid "$UDID" "$FLOW"
echo "=== iOS Simulator E2E: PASS ==="
