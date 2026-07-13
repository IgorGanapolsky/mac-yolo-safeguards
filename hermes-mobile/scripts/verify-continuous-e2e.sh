#!/usr/bin/env bash
# Read-only status for Hermes Mobile continuous E2E (LaunchAgent + latest.json).
# Exit 0 always for human status; with --strict exit 1 when e2e != pass.
set -euo pipefail

GUI_DOMAIN="gui/$(id -u)"
LABEL="com.igor.hermes-mobile-continuous-e2e"
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
LATEST_JSON="${REPO_ROOT}/hermes-mobile/docs/proofs/continuous/latest.json"
STRICT=0
JSON_OUT=0
for arg in "$@"; do
  case "$arg" in
    --strict) STRICT=1 ;;
    --json) JSON_OUT=1 ;;
  esac
done

e2e_status="missing"
unit_status="missing"
updated_at=""
detail=""
if [[ -f "$LATEST_JSON" ]]; then
  e2e_status=$(python3 -c "import json,sys; d=json.load(open(sys.argv[1])); print(d.get('e2e') or 'missing')" "$LATEST_JSON" 2>/dev/null || echo missing)
  unit_status=$(python3 -c "import json,sys; d=json.load(open(sys.argv[1])); print(d.get('unit') or 'missing')" "$LATEST_JSON" 2>/dev/null || echo missing)
  updated_at=$(python3 -c "import json,sys; d=json.load(open(sys.argv[1])); print(d.get('updatedAt') or '')" "$LATEST_JSON" 2>/dev/null || true)
  detail=$(python3 -c "import json,sys; d=json.load(open(sys.argv[1])); print(d.get('detail') or '')" "$LATEST_JSON" 2>/dev/null || true)
fi

device_verified=false
if [[ "$e2e_status" == "pass" ]]; then
  device_verified=true
fi

if [[ "$JSON_OUT" -eq 1 ]]; then
  python3 - <<PY
import json
print(json.dumps({
  "e2e": "$e2e_status",
  "unit": "$unit_status",
  "updatedAt": "$updated_at",
  "detail": """$detail""",
  "deviceVerified": $device_verified,
  "strict": bool($STRICT),
}, indent=2))
PY
else
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
  echo "deviceVerified=${device_verified} (true only when e2e=pass)"
  if [[ -f "${HOME}/Library/Logs/hermes-mobile-continuous-e2e.log" ]]; then
    echo "Last 8 log lines:"
    tail -8 "${HOME}/Library/Logs/hermes-mobile-continuous-e2e.log"
  fi
fi

if [[ "$STRICT" -eq 1 && "$device_verified" != "true" ]]; then
  echo "STRICT: device not verified (e2e=${e2e_status})" >&2
  exit 1
fi
exit 0
