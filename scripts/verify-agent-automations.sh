#!/usr/bin/env bash
# Read-only status for agent-facing LaunchAgents (does not install or modify).
set -euo pipefail

GUI_DOMAIN="gui/$(id -u)"

EXPECTED=(
  com.igor.ceo-operating-brief
  com.igor.hermes-source-packs
  com.igor.react-native-newsletter-ingest
  com.igor.hermes-contribution-opportunities
  com.igor.hermes-mobile-continuous-e2e
  com.igor.shutdown-simulators
  com.igor.revenue-autonomous-loop
  com.igor.smart-ops
  com.igor.agent-vault-sync
)

missing=0

echo "=== Agent LaunchAgent status ==="
for label in "${EXPECTED[@]}"; do
  if launchctl print "${GUI_DOMAIN}/${label}" >/dev/null 2>&1; then
    echo "$label: loaded"
    launchctl print "${GUI_DOMAIN}/${label}" 2>/dev/null | grep 'state =' || true
    launchctl print "${GUI_DOMAIN}/${label}" 2>/dev/null | grep 'run interval' || true
    launchctl print "${GUI_DOMAIN}/${label}" 2>/dev/null | grep 'last exit code' || true
  else
    echo "$label: MISSING"
    missing=$((missing + 1))
  fi
  echo "---"
done

if (( missing > 0 )); then
  echo "Install agent jobs: bash scripts/install-agent-automations.sh"
  echo "Install sim guard: ./install.sh (repo root)"
  exit 1
fi

e2e_bad=0
if launchctl print "${GUI_DOMAIN}/com.igor.hermes-mobile-continuous-e2e" 2>/dev/null | grep -q '\.worktrees/'; then
  echo "com.igor.hermes-mobile-continuous-e2e: BAD PATH (points at git worktree — jest/Maestro live in canonical hermes-mobile)"
  launchctl print "${GUI_DOMAIN}/com.igor.hermes-mobile-continuous-e2e" 2>/dev/null | grep 'run-continuous-e2e.sh' || true
  e2e_bad=1
fi

if (( e2e_bad > 0 )); then
  echo "Repair: bash scripts/install-agent-launchagents.sh"
  exit 1
fi

echo "All expected LaunchAgents are loaded."
