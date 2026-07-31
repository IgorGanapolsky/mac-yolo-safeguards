#!/usr/bin/env bash
# Create and prove a disposable iPad simulator before delegating to the shared iOS runner.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FLOW="${1:-.maestro/ipad-simulator-edge-cases.yaml}"
SIMULATOR_RUNNER="${HERMES_SIMULATOR_RUNNER:-$SCRIPT_DIR/run-simulator-e2e.sh}"
E2E_LEASE_DIR="${YOLO_E2E_LEASE_DIR:-/tmp/yolo-guard-e2e}"

if ! command -v xcrun >/dev/null 2>&1; then
  echo "xcrun is required for iPad simulator E2E" >&2
  exit 1
fi

IPAD_TEMPLATE_RECORD="$(
  xcrun simctl list devices available -j | node -e '
    const fs = require("fs");
    const payload = JSON.parse(fs.readFileSync(0, "utf8"));
    const devices = Object.entries(payload.devices || {})
      .filter(([runtime]) => runtime.includes("iOS"))
      .flatMap(([runtime, runtimeDevices]) =>
        runtimeDevices.map((device) => ({ ...device, runtime })),
      )
      .filter((device) => device.isAvailable !== false)
      .filter((device) => device.name.startsWith("iPad"))
      .filter((device) => device.deviceTypeIdentifier);
    if (devices.length === 0) process.exit(2);
    process.stdout.write(
      `${devices[0].name}\t${devices[0].deviceTypeIdentifier}\t${devices[0].runtime}`,
    );
  '
)" || {
  echo "No available iPad simulator was found" >&2
  exit 1
}

IFS=$'\t' read -r IPAD_TEMPLATE_NAME IPAD_DEVICE_TYPE IPAD_RUNTIME <<<"$IPAD_TEMPLATE_RECORD"
if [[ -z "$IPAD_TEMPLATE_NAME" || -z "$IPAD_DEVICE_TYPE" || -z "$IPAD_RUNTIME" ]]; then
  echo "Failed to resolve an iPad simulator template" >&2
  exit 1
fi

IPAD_UDID=""
E2E_LEASE_FILE=""
RUN_PASSED=0

simulator_is_absent() {
  xcrun simctl list devices -j | IPAD_UDID="$IPAD_UDID" node -e '
    const fs = require("fs");
    const payload = JSON.parse(fs.readFileSync(0, "utf8"));
    const devices = Object.values(payload.devices || {}).flat();
    process.exit(
      devices.some((device) => device.udid === process.env.IPAD_UDID) ? 1 : 0,
    );
  '
}

cleanup() {
  local original_status=$?
  local cleanup_failed=0
  local simulator_deleted=0
  trap - EXIT

  if [[ -n "$IPAD_UDID" ]]; then
    for attempt in 1 2; do
      xcrun simctl shutdown "$IPAD_UDID" >/dev/null 2>&1 || true
      if xcrun simctl delete "$IPAD_UDID" >/dev/null 2>&1; then
        :
      fi
      if simulator_is_absent; then
        simulator_deleted=1
        break
      fi
      if [[ "$attempt" -eq 1 ]]; then
        sleep 1
      fi
    done
    if [[ "$simulator_deleted" -ne 1 ]]; then
      echo "Failed to delete disposable iPad simulator $IPAD_UDID" >&2
      cleanup_failed=1
    fi
  fi
  if [[ -n "$E2E_LEASE_FILE" ]]; then
    if ! rm -f "$E2E_LEASE_FILE"; then
      echo "Failed to remove iPad E2E lease $E2E_LEASE_FILE" >&2
      cleanup_failed=1
    fi
  fi
  if [[ "$cleanup_failed" -ne 0 ]]; then
    exit 1
  fi
  if [[ "$original_status" -eq 0 && "$RUN_PASSED" -eq 1 ]]; then
    echo "=== Strict iPad Simulator E2E: PASS ($IPAD_NAME) ==="
  fi
  exit "$original_status"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

mkdir -p "$E2E_LEASE_DIR"
E2E_LEASE_FILE="$E2E_LEASE_DIR/ipad-simulator-e2e-$$.pid"
printf '%s\n' "$$" >"$E2E_LEASE_FILE"

IPAD_NAME="iPad Hermes E2E ${GITHUB_RUN_ID:-local}-${GITHUB_RUN_ATTEMPT:-1}-$$"
IPAD_UDID="$(xcrun simctl create "$IPAD_NAME" "$IPAD_DEVICE_TYPE" "$IPAD_RUNTIME")"
if [[ -z "$IPAD_UDID" ]]; then
  echo "Failed to create a disposable iPad simulator from $IPAD_TEMPLATE_NAME" >&2
  exit 1
fi

echo "Strict disposable iPad target: $IPAD_NAME ($IPAD_UDID)" >&2
xcrun simctl shutdown all >/dev/null 2>&1 || true
xcrun simctl boot "$IPAD_UDID"
xcrun simctl bootstatus "$IPAD_UDID" -b

xcrun simctl list devices booted -j | IPAD_UDID="$IPAD_UDID" node -e '
  const fs = require("fs");
  const payload = JSON.parse(fs.readFileSync(0, "utf8"));
  const booted = Object.values(payload.devices || {}).flat();
  if (
    booted.length !== 1 ||
    booted[0].udid !== process.env.IPAD_UDID ||
    !booted[0].name.startsWith("iPad") ||
    booted[0].state !== "Booted"
  ) {
    console.error(`Expected exactly one booted iPad ${process.env.IPAD_UDID}; got ${JSON.stringify(booted)}`);
    process.exit(1);
  }
'

HERMES_SIM_NAME="$IPAD_NAME" \
EXPO_PUBLIC_E2E_AUTOMATION=0 \
bash "$SIMULATOR_RUNNER" "$FLOW"

xcrun simctl list devices booted -j | IPAD_UDID="$IPAD_UDID" node -e '
  const fs = require("fs");
  const payload = JSON.parse(fs.readFileSync(0, "utf8"));
  const selected = Object.values(payload.devices || {})
    .flat()
    .find((device) => device.udid === process.env.IPAD_UDID);
  if (!selected || !selected.name.startsWith("iPad") || selected.state !== "Booted") {
    console.error(`iPad ${process.env.IPAD_UDID} was not the proven test target`);
    process.exit(1);
  }
'

RUN_PASSED=1
