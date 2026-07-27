#!/usr/bin/env bash
# Boot an iOS simulator (if needed), fresh-install an embedded Release build, run Maestro.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HERMES_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
# shellcheck source=maestro-env.sh
source "$SCRIPT_DIR/maestro-env.sh"

DEFAULT_SIM_NAME="${HERMES_SIM_NAME:-iPhone 17 Pro}"
MAESTRO_READY_TIMEOUT_SEC="${MAESTRO_READY_TIMEOUT_SEC:-120}"
IOS_BUNDLE_ID="${HERMES_IOS_BUNDLE_ID:-com.iganapolsky.hermesmobile}"
FLOW="${1:-.maestro/full-suite.yaml}"

# Simulator E2E relies on hermes://setup?demo=1 and developer unlock links.
# Export before `expo run:ios` so the native build embeds the automation flag.
export EXPO_PUBLIC_E2E_AUTOMATION="${EXPO_PUBLIC_E2E_AUTOMATION:-1}"
# This local-only artifact is never distributed; provider source-map upload remains
# enabled for EAS/store builds and must not make simulator installation credential-bound.
export SENTRY_DISABLE_AUTO_UPLOAD=true

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
      if maestro list-devices >/dev/null 2>&1; then
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

install_fresh_ios_release() {
  local udid="$1"
  local installed_apps
  echo "iOS app:   uninstalling any stale $IOS_BUNDLE_ID simulator build" >&2
  if ! installed_apps="$(xcrun simctl listapps "$udid")"; then
    echo "Failed to query installed apps on simulator $udid" >&2
    return 1
  fi
  if grep -Fq "\"$IOS_BUNDLE_ID\" =" <<<"$installed_apps"; then
    if ! xcrun simctl uninstall "$udid" "$IOS_BUNDLE_ID"; then
      echo "Failed to uninstall stale $IOS_BUNDLE_ID from simulator $udid" >&2
      return 1
    fi
  fi
  if ! installed_apps="$(xcrun simctl listapps "$udid")"; then
    echo "Failed to verify clean-install state on simulator $udid" >&2
    return 1
  fi
  if grep -Fq "\"$IOS_BUNDLE_ID\" =" <<<"$installed_apps"; then
    echo "Stale $IOS_BUNDLE_ID container remains after uninstall on simulator $udid" >&2
    return 1
  fi
  echo "iOS app:   building and installing exact-head embedded Release build" >&2
  npx expo run:ios --no-bundler --device "$udid" --configuration Release

  if ! xcrun simctl get_app_container "$udid" "$IOS_BUNDLE_ID" app >/dev/null 2>&1; then
    echo "Failed to install $IOS_BUNDLE_ID on simulator $udid" >&2
    return 1
  fi

  local app_path
  app_path="$(xcrun simctl get_app_container "$udid" "$IOS_BUNDLE_ID" app)"
  if [[ ! -s "$app_path/main.jsbundle" ]]; then
    echo "Installed Release app is missing a non-empty embedded main.jsbundle: $app_path" >&2
    return 1
  fi
  echo "iOS app:   embedded bundle verified ($(wc -c <"$app_path/main.jsbundle" | tr -d ' ') bytes)" >&2
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
  wait_for_simulator_boot "$udid"
  echo "$udid"
}

UDID="$(resolve_sim_udid)"
echo "=== Hermes Mobile iOS Simulator E2E ==="
echo "Simulator: $UDID"
echo "Flow:      $FLOW"
echo "Bundle:    $IOS_BUNDLE_ID"
echo "Java:      ${JAVA_HOME:-system}"
echo "Maestro driver timeout: ${MAESTRO_DRIVER_STARTUP_TIMEOUT}ms"

wait_for_maestro_ios_device "$UDID"
install_fresh_ios_release "$UDID"

cd "$HERMES_DIR"
maestro test -p ios --udid "$UDID" "$FLOW"
echo "=== iOS Simulator E2E: PASS ==="
