#!/usr/bin/env bash
# Read-only status for Hermes Mobile continuous E2E (LaunchAgent + latest.json).
# Default: exit 0 for human status. --strict: exit 1 when e2e != pass.
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

if [[ "$JSON_OUT" -eq 1 ]]; then
  python3 - "$LATEST_JSON" "$STRICT" <<'PY2'
import json, sys
path, strict = sys.argv[1], sys.argv[2] == "1"
data = {}
try:
    with open(path) as f:
        data = json.load(f)
except Exception:
    data = {}
e2e = data.get("e2e") or "missing"
out = {
    "e2e": e2e,
    "unit": data.get("unit") or "missing",
    "updatedAt": data.get("updatedAt") or "",
    "detail": data.get("detail") or "",
    "deviceVerified": e2e == "pass",
    "strict": strict,
}
print(json.dumps(out, indent=2))
sys.exit(1 if strict and e2e != "pass" else 0)
PY2
  exit $?
fi

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
e2e_status="missing"
if [[ -f "$LATEST_JSON" ]]; then
  echo "Latest cycle:"
  cat "$LATEST_JSON"
  e2e_status=$(python3 -c "import json,sys; print(json.load(open(sys.argv[1])).get('e2e') or 'missing')" "$LATEST_JSON" 2>/dev/null || echo missing)
else
  echo "No cycle recorded yet (${LATEST_JSON})"
fi
echo "---"
device_verified=false
[[ "$e2e_status" == "pass" ]] && device_verified=true
echo "deviceVerified=${device_verified} (true only when e2e=pass)"
if [[ -f "${HOME}/Library/Logs/hermes-mobile-continuous-e2e.log" ]]; then
  echo "Last 8 log lines:"
  tail -8 "${HOME}/Library/Logs/hermes-mobile-continuous-e2e.log"
fi
if [[ "$STRICT" -eq 1 && "$device_verified" != "true" ]]; then
  echo "STRICT: device not verified (e2e=${e2e_status})" >&2
  exit 1
fi
exit 0
