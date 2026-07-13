#!/usr/bin/env bash
# Read-only status for Hermes Mobile continuous E2E (LaunchAgent + latest.json).
# G-05: exits non-zero / emits deviceVerified:false when e2e != pass (ship-theater gate).
set -euo pipefail

GUI_DOMAIN="gui/$(id -u)"
LABEL="com.igor.hermes-mobile-continuous-e2e"
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
LATEST_JSON="${REPO_ROOT}/hermes-mobile/docs/proofs/continuous/latest.json"

JSON_MODE=0
REQUIRE_PASS=0
while [[ $# -gt 0 ]]; do
  case "$1" in
    --json) JSON_MODE=1; shift ;;
    --require-pass) REQUIRE_PASS=1; shift ;;
    -h|--help)
      echo "Usage: $(basename "$0") [--json] [--require-pass]"
      echo "  --json          Output JSON with deviceVerified flag"
      echo "  --require-pass  Exit 1 if e2e != pass or stale (ship-theater gate)"
      exit 0
      ;;
    *) shift ;;
  esac
done

get_json_field() {
  local field="$1"
  local file="$2"
  python3 -c "import json,sys; d=json.load(open(sys.argv[1])); print(d.get(sys.argv[2], ''))" "$file" "$field" 2>/dev/null || echo ""
}

device_verified=0
e2e_status=""
unit_status=""
updated_at=""
age_hours=9999

if [[ -f "$LATEST_JSON" ]]; then
  e2e_status="$(get_json_field e2e "$LATEST_JSON")"
  unit_status="$(get_json_field unit "$LATEST_JSON")"
  updated_at="$(get_json_field updatedAt "$LATEST_JSON")"
  if [[ -n "$updated_at" ]]; then
    age_hours=$(python3 -c "
import datetime, sys
from datetime import timezone
try:
  s=sys.argv[1]
  # Parse ISO8601 Zulu
  if s.endswith('Z'):
    s=s[:-1]+'+00:00'
  dt=datetime.datetime.fromisoformat(s)
  now=datetime.datetime.now(timezone.utc)
  delta=now-dt
  print(int(delta.total_seconds()//3600))
except Exception:
  print(9999)
" "$updated_at" 2>/dev/null || echo 9999)
  fi
  if [[ "$e2e_status" == "pass" && "$unit_status" == "pass" ]]; then
    # Fresh within 24h
    if [[ "$age_hours" =~ ^[0-9]+$ ]] && (( age_hours <= 24 )); then
      device_verified=1
    fi
  fi
fi

if [[ $JSON_MODE -eq 1 ]]; then
  python3 -c "
import json, sys, os
path=sys.argv[1]
e2e=sys.argv[2]
unit=sys.argv[3]
updated=sys.argv[4]
verified=sys.argv[5]=='1'
age=sys.argv[6]
try:
  data=json.load(open(path)) if os.path.exists(path) else {}
except:
  data={}
data['deviceVerified']=verified
data['e2e']=e2e
data['unit']=unit
data['updatedAt']=updated
data['ageHours']=int(age) if age.isdigit() else 9999
print(json.dumps(data, indent=2))
" "$LATEST_JSON" "$e2e_status" "$unit_status" "$updated_at" "$device_verified" "$age_hours"
  if [[ $REQUIRE_PASS -eq 1 && $device_verified -ne 1 ]]; then
    exit 1
  fi
  exit 0
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
if [[ -f "$LATEST_JSON" ]]; then
  echo "Latest cycle:"
  cat "$LATEST_JSON"
  echo "---"
  echo "deviceVerified: $([[ $device_verified -eq 1 ]] && echo true || echo false) (e2e=$e2e_status unit=$unit_status age=${age_hours}h)"
  if [[ $device_verified -ne 1 ]]; then
    echo "UNVERIFIED: e2e must be pass and unit pass and fresh <24h. Current e2e=$e2e_status unit=$unit_status age=${age_hours}h"
  fi
else
  echo "No cycle recorded yet (${LATEST_JSON})"
  echo "deviceVerified: false"
fi

echo "---"
if [[ -f "${HOME}/Library/Logs/hermes-mobile-continuous-e2e.log" ]]; then
  echo "Last 8 log lines:"
  tail -8 "${HOME}/Library/Logs/hermes-mobile-continuous-e2e.log"
fi

if [[ $REQUIRE_PASS -eq 1 ]]; then
  if [[ $device_verified -ne 1 ]]; then
    echo "Ship-theater gate: device NOT verified (e2e=$e2e_status). Refusing ship claim." >&2
    exit 1
  fi
fi

# Default behavior for G-05: exit non-zero when e2e != pass to prevent ship theater
if [[ -n "$e2e_status" && "$e2e_status" != "pass" ]]; then
  # Only exit 1 if explicitly required? For now, print warning but exit 1 to enforce gate in CI
  # To avoid breaking existing status calls that expect 0, we exit 1 only when e2e is fail and file exists
  # The AGENTS.md says read latest.json before claiming; this script enforces via exit code when used with --require-pass
  # For G-05 AC, we exit 1 when e2e is fail/skip and not fresh
  if [[ $device_verified -ne 1 ]]; then
    exit 1
  fi
fi

exit 0
