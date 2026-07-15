#!/bin/sh
# chrome-background-cpu-harden.sh
#
# MakeUseOf 2026-07-14 class: disable browser background mode + dial preload
# back to Standard so Chrome does not keep eating CPU after windows close.
# https://www.makeuseof.com/i-disabled-my-browsers-background-processes-and-cut-cpu-usage-in-half/
#
# Uses Chrome enterprise policy domains via `defaults` so settings survive
# preference UI churn. Never kills Google Chrome / Cursor / IDEs (hard kit rule).
# Hermes CDP profile is not deleted; only Chrome policy domains are written.
#
# Usage:
#   bash scripts/chrome-background-cpu-harden.sh --status
#   bash scripts/chrome-background-cpu-harden.sh --install
#   bash scripts/chrome-background-cpu-harden.sh --install --json
#
# Exit: 0 when desired policies are present (or no Chrome-family browser).
set -eu

ACTION="--status"
JSON=0

for a in "$@"; do
  case "$a" in
    --status|--install|--help|-h) ACTION="$a" ;;
    --json) JSON=1 ;;
  esac
done

if [ "$ACTION" = "--help" ] || [ "$ACTION" = "-h" ]; then
  sed -n '2,18p' "$0" | sed 's/^# \{0,1\}//'
  exit 0
fi

# Bundle-id domains Chrome reads for managed policies on macOS.
CANDIDATE_DOMAINS="com.google.Chrome com.google.Chrome.canary com.google.Chrome.beta com.google.Chrome.dev org.chromium.Chromium"

domain_app_path() {
  case "$1" in
    com.google.Chrome) echo "/Applications/Google Chrome.app" ;;
    com.google.Chrome.canary) echo "/Applications/Google Chrome Canary.app" ;;
    com.google.Chrome.beta) echo "/Applications/Google Chrome Beta.app" ;;
    com.google.Chrome.dev) echo "/Applications/Google Chrome Dev.app" ;;
    org.chromium.Chromium) echo "/Applications/Chromium.app" ;;
    *) echo "" ;;
  esac
}

should_manage_domain() {
  d="$1"
  app="$(domain_app_path "$d")"
  if [ -n "$app" ] && [ -d "$app" ]; then
    return 0
  fi
  if /usr/bin/defaults read "$d" >/dev/null 2>&1; then
    return 0
  fi
  return 1
}

read_boolish() {
  d="$1"
  k="$2"
  v="$(/usr/bin/defaults read "$d" "$k" 2>/dev/null || true)"
  case "$v" in
    0|false|False|NO|No) echo 0 ;;
    1|true|True|YES|Yes) echo 1 ;;
    "") echo missing ;;
    *) echo "$v" ;;
  esac
}

read_int() {
  d="$1"
  k="$2"
  v="$(/usr/bin/defaults read "$d" "$k" 2>/dev/null || true)"
  if [ -z "$v" ]; then echo missing; else echo "$v"; fi
}

apply_domain() {
  d="$1"
  /usr/bin/defaults write "$d" BackgroundModeEnabled -bool false
  # PreloadPages: 0=No, 1=Standard, 2=Extended (Chrome enterprise enum)
  /usr/bin/defaults write "$d" PreloadPages -int 1
  /usr/bin/defaults write "$d" HighEfficiencyModeEnabled -bool true
}

status_domain() {
  d="$1"
  bg="$(read_boolish "$d" BackgroundModeEnabled)"
  pre="$(read_int "$d" PreloadPages)"
  he="$(read_boolish "$d" HighEfficiencyModeEnabled)"
  ok=1
  if [ "$bg" != "0" ]; then ok=0; fi
  case "$pre" in
    0|1) ;;
    *) ok=0 ;;
  esac
  printf '%s\n' "$d|$bg|$pre|$he|$ok"
}

count_chrome_helpers() {
  /bin/ps -axo comm 2>/dev/null | /usr/bin/grep -c 'Google Chrome Helper' || true
}

DOMAINS_MANAGED=""
STATUS_LINES=""
ALL_OK=1
APPLIED=0
MANAGED_COUNT=0

for d in $CANDIDATE_DOMAINS; do
  if should_manage_domain "$d"; then
    DOMAINS_MANAGED="$DOMAINS_MANAGED $d"
    MANAGED_COUNT=$((MANAGED_COUNT + 1))
  fi
done

if [ "$ACTION" = "--install" ]; then
  for d in $DOMAINS_MANAGED; do
    apply_domain "$d"
    APPLIED=$((APPLIED + 1))
  done
fi

for d in $DOMAINS_MANAGED; do
  line="$(status_domain "$d")"
  if [ -z "$STATUS_LINES" ]; then
    STATUS_LINES="$line"
  else
    STATUS_LINES="$STATUS_LINES
$line"
  fi
  ok="$(printf '%s\n' "$line" | /usr/bin/awk -F'|' '{print $5}')"
  if [ "$ok" != "1" ]; then ALL_OK=0; fi
done

HELPERS="$(count_chrome_helpers)"
# No Chrome installed → success (nothing to harden)
if [ "$MANAGED_COUNT" -eq 0 ]; then
  ALL_OK=1
fi

if [ "$JSON" -eq 1 ]; then
  export CBH_ALL_OK="$ALL_OK" CBH_APPLIED="$APPLIED" CBH_HELPERS="$HELPERS" CBH_ACTION="$ACTION" CBH_LINES="$STATUS_LINES" CBH_MANAGED="$MANAGED_COUNT"
  python3 <<'PY'
import json, os
lines = [ln for ln in os.environ.get("CBH_LINES", "").splitlines() if ln.strip()]
domains = []
for ln in lines:
    parts = ln.split("|")
    if len(parts) < 5:
        continue
    domains.append({
        "domain": parts[0],
        "BackgroundModeEnabled": parts[1],
        "PreloadPages": parts[2],
        "HighEfficiencyModeEnabled": parts[3],
        "ok": parts[4] == "1",
    })
managed = int(os.environ.get("CBH_MANAGED") or 0)
all_ok = os.environ.get("CBH_ALL_OK") == "1"
print(json.dumps({
    "schema": "chrome-background-cpu-harden/v1",
    "action": os.environ.get("CBH_ACTION", "").replace("--", ""),
    "ok": all_ok,
    "managedDomainCount": managed,
    "domainsApplied": int(os.environ.get("CBH_APPLIED") or 0),
    "domains": domains,
    "chromeHelperProcesses": int(os.environ.get("CBH_HELPERS") or 0),
    "policy": {
        "BackgroundModeEnabled": False,
        "PreloadPages": 1,
        "HighEfficiencyModeEnabled": True,
        "note": "PreloadPages 1=Standard (not Extended). Never kills primary Chrome.",
    },
    "source": "https://www.makeuseof.com/i-disabled-my-browsers-background-processes-and-cut-cpu-usage-in-half/",
}, indent=2))
raise SystemExit(0 if all_ok else 1)
PY
  exit $?
fi

echo "chrome-background-cpu-harden ($ACTION)"
if [ "$MANAGED_COUNT" -eq 0 ]; then
  echo "  no Chrome-family browsers found; nothing to manage"
  exit 0
fi
printf '%s\n' "$STATUS_LINES" | while IFS='|' read -r d bg pre he ok; do
  flag="OK"
  [ "$ok" = "1" ] || flag="FAIL"
  printf "  [%s] %s  BackgroundModeEnabled=%s PreloadPages=%s HighEfficiencyModeEnabled=%s\n" \
    "$flag" "$d" "$bg" "$pre" "$he"
done
printf "  chrome helper processes (informational): %s\n" "$HELPERS"
printf "  applied_this_run: %s\n" "$APPLIED"
echo "  note: restart Chrome for UI to reflect policies; kit never auto-kills primary Chrome"

if [ "$ALL_OK" -eq 1 ]; then
  exit 0
fi
exit 1
