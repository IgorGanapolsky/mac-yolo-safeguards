#!/usr/bin/env bash
# Ship-adjacent USB cable connect gate.
# STATIC always; DEVICE when a physical Android phone is USB-attached.
# Use --require-device for dogfood sessions where the cable is expected.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$SCRIPT_DIR/../.." && pwd)"
NODE_BIN="${NODE_BIN:-node}"

exec "$NODE_BIN" "$REPO/tools/check-usb-cable-connect-gate.js" "$@"
