#!/usr/bin/env bash
# Run Maestro E2E on USB Android device, or fall back to iOS simulator.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HERMES_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
# shellcheck source=maestro-env.sh
source "$SCRIPT_DIR/maestro-env.sh"

FLOW="${1:-.maestro/full-suite.yaml}"

if ! command -v maestro >/dev/null 2>&1; then
  echo "Maestro required: curl -fsSL https://get.maestro.mobile.dev | bash" >&2
  exit 1
fi

wait_for_android_device() {
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

if [[ "${HERMES_E2E_IOS_ONLY:-}" == "1" ]]; then
  ANDROID_ID=""
else
  ANDROID_ID="$(adb devices 2>/dev/null | awk 'NR>1 && $2=="device" {print $1; exit}')"
fi

if [[ -z "$ANDROID_ID" && -n "${HERMES_E2E_ANDROID_UDID:-}" ]]; then
  echo "Waiting for USB Android device ${HERMES_E2E_ANDROID_UDID}..."
  ANDROID_ID="$(wait_for_android_device 12 || true)"
fi

if [[ -z "$ANDROID_ID" && "${HERMES_E2E_ANDROID_ONLY:-}" == "1" ]]; then
  echo "Android-only E2E requested but no USB device is connected" >&2
  exit 1
fi

if [ -n "$ANDROID_ID" ]; then
  echo "=== Hermes Mobile Android Device E2E ==="
  echo "Device: $ANDROID_ID"
  echo "Flow:   $FLOW"
  cd "$HERMES_DIR"
  maestro test -p android --udid "$ANDROID_ID" "$FLOW"
  echo "=== Android Device E2E: PASS ==="
  exit 0
fi

exec "$SCRIPT_DIR/run-simulator-e2e.sh" "$FLOW"
