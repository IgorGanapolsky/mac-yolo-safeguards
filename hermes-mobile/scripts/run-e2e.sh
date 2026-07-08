#!/usr/bin/env bash
# Run Maestro E2E on USB Android device, or fall back to iOS simulator.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HERMES_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
# shellcheck source=maestro-env.sh
source "$SCRIPT_DIR/maestro-env.sh"

FLOW="${1:-.maestro/full-suite.yaml}"
MAESTRO_AVD_NAME="${HERMES_E2E_AVD_NAME:-Maestro_ANDROID_pixel_6_android-33}"
CPU_COUNT="$(sysctl -n hw.ncpu 2>/dev/null || nproc 2>/dev/null || echo 8)"
if [[ -n "${HERMES_E2E_MAX_LOAD:-}" ]]; then
  MAX_LOAD="$HERMES_E2E_MAX_LOAD"
elif [[ "$CPU_COUNT" =~ ^[0-9]+$ ]] && (( CPU_COUNT > 6 )); then
  MAX_LOAD="$CPU_COUNT"
else
  MAX_LOAD="6"
fi

if ! command -v maestro >/dev/null 2>&1; then
  echo "Maestro required: curl -fsSL https://get.maestro.mobile.dev | bash" >&2
  exit 1
fi

load1() {
  uptime | sed -E 's/.*load averages?: ([0-9.]+).*/\1/'
}

number_gt() {
  awk -v left="$1" -v right="$2" 'BEGIN { exit !(left > right) }'
}

load_ok_for_e2e() {
  if [[ "${HERMES_E2E_FORCE:-}" == "1" ]]; then
    return 0
  fi
  local current_load
  current_load="$(load1)"
  if number_gt "$current_load" "$MAX_LOAD"; then
    echo "System load ${current_load} exceeds max ${MAX_LOAD} — skipping Android AVD boot" >&2
    return 1
  fi
  return 0
}

is_usb_android_id() {
  local id="$1"
  [[ -n "$id" && "$id" != emulator-* ]]
}

first_usb_android_id() {
  adb devices 2>/dev/null | awk 'NR>1 && $2=="device" && $1 !~ /^emulator-/ {print $1; exit}'
}

first_android_id() {
  adb devices 2>/dev/null | awk 'NR>1 && $2=="device" {print $1; exit}'
}

android_device_responsive() {
  local id="$1"
  adb -s "$id" shell echo ok >/dev/null 2>&1
}

wait_for_android_device() {
  local attempts="${1:-12}"
  local i=0
  while [[ $i -lt $attempts ]]; do
    local id
    id="$(first_android_id)"
    if [[ -n "$id" ]] && android_device_responsive "$id"; then
      echo "$id"
      return 0
    fi
    sleep 5
    i=$((i + 1))
  done
  return 1
}

resolve_emulator_bin() {
  if [[ -n "${ANDROID_HOME:-}" && -x "${ANDROID_HOME}/emulator/emulator" ]]; then
    echo "${ANDROID_HOME}/emulator/emulator"
    return 0
  fi
  if [[ -x "${HOME}/Library/Android/sdk/emulator/emulator" ]]; then
    echo "${HOME}/Library/Android/sdk/emulator/emulator"
    return 0
  fi
  command -v emulator 2>/dev/null || true
}

boot_maestro_avd() {
  local emulator_bin
  emulator_bin="$(resolve_emulator_bin)"
  if [[ -z "$emulator_bin" ]]; then
    echo "Android emulator binary not found — cannot boot ${MAESTRO_AVD_NAME}" >&2
    return 1
  fi
  if ! "$emulator_bin" -list-avds 2>/dev/null | grep -qx "$MAESTRO_AVD_NAME"; then
    echo "AVD ${MAESTRO_AVD_NAME} not installed — skipping emulator boot" >&2
    return 1
  fi
  if adb devices 2>/dev/null | awk 'NR>1 && $2=="device" && $1 ~ /^emulator-/ {found=1} END {exit !found}'; then
    echo "Android emulator already listed in adb — waiting for readiness..."
    wait_for_android_device 6 >/dev/null && return 0
  fi
  echo "Booting Android AVD ${MAESTRO_AVD_NAME}..."
  nohup "$emulator_bin" -avd "$MAESTRO_AVD_NAME" -no-window -no-audio -no-boot-anim -gpu swiftshader_indirect \
    >>"${HERMES_E2E_LOG_DIR:-$HERMES_DIR/docs/proofs/continuous}/emulator.log" 2>&1 &
  wait_for_android_device 24 >/dev/null
}

ANDROID_ID=""

if [[ "${HERMES_E2E_IOS_ONLY:-}" == "1" ]]; then
  ANDROID_ID=""
else
  ANDROID_ID="$(first_usb_android_id || true)"
  if [[ -z "$ANDROID_ID" ]]; then
    candidate="$(first_android_id || true)"
    if [[ -n "$candidate" ]] && android_device_responsive "$candidate"; then
      ANDROID_ID="$candidate"
    fi
  fi
fi

if [[ -z "$ANDROID_ID" && -n "${HERMES_E2E_ANDROID_UDID:-}" ]]; then
  echo "Waiting for Android device ${HERMES_E2E_ANDROID_UDID}..."
  ANDROID_ID="$(wait_for_android_device 12 || true)"
fi

if [[ -z "$ANDROID_ID" && "${HERMES_E2E_ANDROID_ONLY:-}" != "1" && "${HERMES_E2E_IOS_ONLY:-}" != "1" ]]; then
  if load_ok_for_e2e && [[ "${HERMES_E2E_BOOT_AVD:-1}" == "1" ]]; then
    boot_maestro_avd || true
    ANDROID_ID="$(wait_for_android_device 6 || true)"
  fi
fi

if [[ -z "$ANDROID_ID" && "${HERMES_E2E_ANDROID_ONLY:-}" == "1" ]]; then
  echo "Android-only E2E requested but no responsive Android device is connected" >&2
  exit 1
fi

run_android_maestro_flow() {
  local device_id="$1"
  local flow="$2"
  local attempt=1
  local max_attempts="${MAESTRO_ANDROID_PREP_RETRIES:-3}"
  cd "$HERMES_DIR"
  while [[ $attempt -le $max_attempts ]]; do
    echo "Maestro Android attempt ${attempt}/${max_attempts}..."
    if ! prepare_android_maestro_driver "$device_id"; then
      attempt=$((attempt + 1))
      sleep 5
      continue
    fi
    if maestro test -p android --udid "$device_id" "$flow"; then
      return 0
    fi
    echo "Maestro attempt ${attempt} failed for ${flow}" >&2
    attempt=$((attempt + 1))
    sleep 8
  done
  return 1
}

if [[ -n "$ANDROID_ID" ]]; then
  echo "=== Hermes Mobile Android Device E2E ==="
  echo "Device: $ANDROID_ID"
  echo "Flow:   $FLOW"
  echo "Maestro driver timeout: ${MAESTRO_DRIVER_STARTUP_TIMEOUT}ms"
  if ! run_android_maestro_flow "$ANDROID_ID" "$FLOW"; then
    echo "=== Android Device E2E: FAIL ===" >&2
    exit 1
  fi
  echo "=== Android Device E2E: PASS ==="
  exit 0
fi

echo "No USB/emulator Android device — using iOS simulator (HERMES_E2E_IOS_ONLY=1)"
export HERMES_E2E_IOS_ONLY=1
exec "$SCRIPT_DIR/run-simulator-e2e.sh" "$FLOW"
