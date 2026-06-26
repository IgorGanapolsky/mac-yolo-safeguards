#!/usr/bin/env bash
# Stop Hermes Mobile dev processes agents often leave running (Metro, expo run:ios, E2E, Gradle).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

echo "Stopping Hermes Mobile dev hogs..."

pkill -f "${ROOT}/node_modules/.bin/expo run:ios" 2>/dev/null || true
pkill -f "${ROOT}/node_modules/.bin/expo start" 2>/dev/null || true
pkill -f "simctl spawn.*HermesMobile.*log stream" 2>/dev/null || true
pkill -f "agent-device test.*${ROOT}/.maestro" 2>/dev/null || true
pkill -f "chrome-headless-shell.*playwright" 2>/dev/null || true

if [[ -d "${ROOT}/android" ]]; then
  (cd "${ROOT}/android" && ./gradlew --stop) 2>/dev/null || true
fi

if lsof -i :8081 -sTCP:LISTEN >/dev/null 2>&1; then
  echo "Port 8081 still in use:"
  lsof -i :8081 -sTCP:LISTEN
else
  echo "Port 8081 free."
fi

echo "Done. Simulator.app may still run — close it manually if you want it off CPU."
