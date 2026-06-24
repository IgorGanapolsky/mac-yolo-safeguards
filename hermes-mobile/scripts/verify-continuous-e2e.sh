#!/usr/bin/env bash
# Read-only status for Hermes Mobile continuous E2E (LaunchAgent + latest.json).
set -euo pipefail

GUI_DOMAIN="gui/$(id -u)"
LABEL="com.igor.hermes-mobile-continuous-e2e"
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
LATEST_JSON="${REPO_ROOT}/hermes-mobile/docs/proofs/continuous/latest.json"

echo "=== Hermes Mobile continuous E2E ==="

if launchctl print "${GUI_DOMAIN}/${LABEL}" >/dev/null 2>&1; then
  echo "${LABEL}: loaded"
  launchctl print "${GUI_DOMAIN}/${LABEL}" 2>/dev/null | grep 'state =' || true
  launchctl print "${GUI_DOMAIN}/${LABEL}" 2>/dev/null | grep 'run interval' || true
  launchctl print "${GUI_DOMAIN}/${LABEL}" 2>/dev/null | grep 'last exit code' || true
else
  echo "${LABEL}: MISSING"
  echo "Install: bash scripts/install-agent-launchagents.sh"
fi

echo "---"
if [[ -f "$LATEST_JSON" ]]; then
  echo "Latest cycle:"
  cat "$LATEST_JSON"
else
  echo "No cycle recorded yet (${LATEST_JSON})"
fi

echo "---"
if [[ -f "${HOME}/Library/Logs/hermes-mobile-continuous-e2e.log" ]]; then
  echo "Last 8 log lines:"
  tail -8 "${HOME}/Library/Logs/hermes-mobile-continuous-e2e.log"
fi
