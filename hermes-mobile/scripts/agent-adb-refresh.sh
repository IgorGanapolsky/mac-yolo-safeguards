#!/usr/bin/env bash
# Refresh adb before session-start device checks, pairing, or "phone not connected" diagnosis.
# Maestro E2E already restarts adb via maestro-env.sh — this covers non-Maestro paths.
# Phone pair/install is serialized by tools/agent-phone-pipeline-lock.js (see PREVENT-RECURRENCE #9).
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=maestro-env.sh
source "$SCRIPT_DIR/maestro-env.sh"

restart_adb_server

devices="$(adb devices 2>/dev/null | awk 'NR>1 && $2=="device" {print $1}' | tr '\n' ' ')"
if [[ -n "${devices// /}" ]]; then
  echo "✓ adb refreshed — device(s): ${devices}"
else
  echo "○ adb refreshed — no device in 'device' state (check USB / authorize prompt)"
fi
