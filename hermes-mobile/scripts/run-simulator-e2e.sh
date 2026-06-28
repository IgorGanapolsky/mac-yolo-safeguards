#!/usr/bin/env bash
# Boot iOS simulator (if needed), ensure Metro-friendly dev client, run full Maestro suite.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HERMES_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
# shellcheck source=maestro-env.sh
source "$SCRIPT_DIR/maestro-env.sh"

DEFAULT_SIM_NAME="${HERMES_SIM_NAME:-iPhone 17 Pro}"
FLOW="${1:-.maestro/full-suite.yaml}"

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
  booted="$(xcrun simctl list devices booted 2>/dev/null | grep -oE '[0-9A-F-]{36}' | head -1 || true)"
  if [ -n "$booted" ]; then
    echo "$booted"
    return
  fi
  local udid
  udid="$(xcrun simctl list devices available 2>/dev/null | grep "$DEFAULT_SIM_NAME (" | head -1 | grep -oE '[0-9A-F-]{36}' || true)"
  if [ -z "$udid" ]; then
    echo "No simulator named '$DEFAULT_SIM_NAME' found." >&2
    exit 1
  fi
  echo "Booting $DEFAULT_SIM_NAME ($udid)..." >&2
  xcrun simctl boot "$udid" || true
  open -a Simulator || true
  xcrun simctl bootstatus "$udid" -b || true
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
sleep 2

cd "$HERMES_DIR"
maestro test -p ios --udid "$UDID" "$FLOW"
echo "=== iOS Simulator E2E: PASS ==="
