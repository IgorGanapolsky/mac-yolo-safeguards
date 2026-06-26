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

ANDROID_ID="$(adb devices 2>/dev/null | awk 'NR>1 && $2=="device" {print $1; exit}')"

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
