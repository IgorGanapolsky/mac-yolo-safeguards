#!/usr/bin/env bash
# Select and prove an iPad simulator before delegating to the shared iOS runner.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FLOW="${1:-.maestro/ipad-simulator-edge-cases.yaml}"
SIMULATOR_RUNNER="${HERMES_SIMULATOR_RUNNER:-$SCRIPT_DIR/run-simulator-e2e.sh}"

if ! command -v xcrun >/dev/null 2>&1; then
  echo "xcrun is required for iPad simulator E2E" >&2
  exit 1
fi

IPAD_RECORD="$(
  xcrun simctl list devices available -j | node -e '
    const fs = require("fs");
    const payload = JSON.parse(fs.readFileSync(0, "utf8"));
    const devices = Object.entries(payload.devices || {})
      .filter(([runtime]) => runtime.includes("iOS"))
      .flatMap(([, runtimeDevices]) => runtimeDevices)
      .filter((device) => device.isAvailable !== false)
      .filter((device) => device.name.startsWith("iPad"));
    if (devices.length === 0) process.exit(2);
    process.stdout.write(`${devices[0].udid}\t${devices[0].name}`);
  '
)" || {
  echo "No available iPad simulator was found" >&2
  exit 1
}

IFS=$'\t' read -r IPAD_UDID IPAD_NAME <<<"$IPAD_RECORD"
if [[ -z "$IPAD_UDID" || -z "$IPAD_NAME" ]]; then
  echo "Failed to resolve an iPad simulator identity" >&2
  exit 1
fi

echo "Strict iPad target: $IPAD_NAME ($IPAD_UDID)" >&2
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

echo "=== Strict iPad Simulator E2E: PASS ($IPAD_NAME) ==="
