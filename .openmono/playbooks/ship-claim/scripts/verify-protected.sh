#!/usr/bin/env bash
# Protected components from AGENTS.md — post-change sanity.
set -euo pipefail

ROOT="${OPENMONO_WORKSPACE:-${OPENMONO_HOST_WORKSPACE:-$PWD}}"
cd "$ROOT"

FAIL=0

echo "=== protected components ==="

# 1) shutdown-simulators LaunchAgent
LABEL=com.igor.shutdown-simulators
if launchctl print "gui/$(id -u)/$LABEL" >/tmp/yolo-launchctl-protected.txt 2>&1; then
  if grep -q "state = running" /tmp/yolo-launchctl-protected.txt; then
    echo "OK: $LABEL state=running"
  else
    echo "FAIL: $LABEL not running" >&2
    cat /tmp/yolo-launchctl-protected.txt >&2
    FAIL=1
  fi
else
  echo "WARN: $LABEL not loaded (may be expected on non-Mac CI host)" >&2
fi

# 2) Claude settings.json valid JSON (if present)
SETTINGS="$HOME/.claude/settings.json"
if [[ -f "$SETTINGS" ]]; then
  if node -e "JSON.parse(require('fs').readFileSync(process.argv[1],'utf8'))" "$SETTINGS" 2>/dev/null; then
    echo "OK: $SETTINGS valid JSON"
  else
    echo "FAIL: $SETTINGS invalid JSON" >&2
    FAIL=1
  fi
else
  echo "SKIP: no $SETTINGS"
fi

# 3) yolo-health quick probe
if [[ -x "$ROOT/yolo-health" ]]; then
  echo "--- yolo-health ---"
  "$ROOT/yolo-health" 2>&1 | head -20 || { echo "FAIL: yolo-health" >&2; FAIL=1; }
else
  echo "SKIP: yolo-health not executable"
fi

if [[ "$FAIL" -ne 0 ]]; then
  echo "=== protected components: FAIL ===" >&2
  exit 1
fi

echo "=== protected components: PASS ==="
