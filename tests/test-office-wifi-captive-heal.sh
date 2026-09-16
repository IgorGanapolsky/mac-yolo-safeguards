#!/usr/bin/env bash
# Contract tests for office-wifi-captive-heal (fixture-driven; no live network mutation).
set -u

REPO="$(cd "$(dirname "$0")/.." && pwd)"
HEAL="$REPO/scripts/office-wifi-captive-heal.sh"
HELPER="$REPO/scripts/office-wifi-privileged-helper.sh"
INSTALLER="$REPO/scripts/install-office-wifi-captive-heal.sh"
PLIST="$REPO/com.igor.office-wifi-captive-heal.plist"
TMP="$(mktemp -d "${TMPDIR:-/tmp}/office-wifi-heal-test.XXXXXX")"
trap 'rm -rf "$TMP"' EXIT INT TERM
pass=0; fail=0
ok() { printf '  [PASS] %s\n' "$1"; pass=$((pass + 1)); }
bad() { printf '  [FAIL] %s\n' "$1"; fail=$((fail + 1)); }

echo '=== office-wifi-captive-heal tests ==='

if bash -n "$HEAL" && bash -n "$HELPER" && bash -n "$INSTALLER"; then
  ok "scripts syntax valid"
else
  bad "scripts syntax invalid"
fi

if plutil -lint "$PLIST" >/dev/null; then
  ok "LaunchAgent plist lints"
else
  bad "LaunchAgent plist invalid"
fi

if grep -q '{{HOME}}/.local/bin/office-wifi-captive-heal.sh' "$PLIST" \
  && grep -q '<string>--heal</string>' "$PLIST" \
  && grep -A1 '<key>StartInterval</key>' "$PLIST" | grep -q '<integer>60</integer>'; then
  ok "plist points at durable helper + 60s interval + --heal"
else
  bad "plist missing durable path / interval / --heal"
fi

# Pure helper unit: refuse non-root
if ! bash "$HELPER" flush-dns >/dev/null 2>&1; then
  ok "privileged helper refuses non-root"
else
  bad "privileged helper ran without root"
fi

# Fixture: office captive broken → --check exit 2
cat > "$TMP/broken.env" <<'EOF'
IP=172.29.14.84
ROUTER=172.29.0.1
SUMMARY='domain_name (string): medusa.local
server_identifier (ip): 10.1.200.1
Router : 172.29.0.1'
POWER=On
PREFERRED_OFFICE=1
OFFICE=1
CAPTIVE_BODY='<HTML><HEAD><TITLE>Hotspot Login</TITLE></HEAD></HTML>'
CAPTIVE_OK=0
HTTPS_CODE=000
HTTPS_OK=0
HEALTHY=0
NEEDS_HEAL=1
EOF

set +e
OUT="$(OFFICE_WIFI_FIXTURE="$TMP/broken.env" OFFICE_WIFI_LOG="$TMP/heal.log" \
  OFFICE_WIFI_STATE_DIR="$TMP/state" bash "$HEAL" --check 2>&1)"
RC=$?
set -e
if [[ "$RC" -eq 2 ]] && printf '%s' "$OUT" | grep -q 'needs_heal=1'; then
  ok "broken office fixture → check exit 2"
else
  bad "broken office fixture check failed rc=$RC out=$OUT"
fi

# Fixture: healthy office → --check exit 0
cat > "$TMP/ok.env" <<'EOF'
IP=172.29.14.84
ROUTER=172.29.0.1
SUMMARY='domain_name (string): medusa.local'
POWER=On
PREFERRED_OFFICE=1
OFFICE=1
CAPTIVE_BODY='<HTML><HEAD><TITLE>Success</TITLE></HEAD><BODY>Success</BODY></HTML>'
CAPTIVE_OK=1
HTTPS_CODE=200
HTTPS_OK=1
HEALTHY=1
NEEDS_HEAL=0
EOF

set +e
OUT="$(OFFICE_WIFI_FIXTURE="$TMP/ok.env" OFFICE_WIFI_LOG="$TMP/heal.log" \
  OFFICE_WIFI_STATE_DIR="$TMP/state" bash "$HEAL" --check 2>&1)"
RC=$?
set -e
if [[ "$RC" -eq 0 ]] && printf '%s' "$OUT" | grep -q 'needs_heal=0'; then
  ok "healthy office fixture → check exit 0"
else
  bad "healthy office fixture check failed rc=$RC out=$OUT"
fi

# Dry-run heal on broken fixture must not claim reboot / preferences.plist wipe
set +e
OUT="$(OFFICE_WIFI_FIXTURE="$TMP/broken.env" OFFICE_WIFI_LOG="$TMP/heal.log" \
  OFFICE_WIFI_STATE_DIR="$TMP/state" OFFICE_WIFI_COOLDOWN_SEC=0 \
  bash "$HEAL" --heal --dry-run --force 2>&1)"
RC=$?
set -e
if [[ "$RC" -eq 0 ]] \
  && printf '%s' "$OUT" | grep -q 'heal: open Captive Network Assistant' \
  && ! printf '%s' "$OUT" | grep -qi 'preferences.plist' \
  && ! printf '%s' "$OUT" | grep -qi 'reboot'; then
  ok "dry-run heal opens captive assistant and refuses prefs/reboot"
else
  bad "dry-run heal contract failed rc=$RC out=$OUT"
fi

# Detection helpers — extract function bodies without macOS-incompatible `head -n -1`
FUNCS="$TMP/detect_funcs.sh"
awk '
  /^is_office_ip\(\)/ {keep=1}
  /^read_live_snapshot\(\)/ {keep=0}
  keep {print}
' "$HEAL" > "$FUNCS"
# shellcheck disable=SC1090
source "$FUNCS"
if is_office_ip "172.29.1.2" && ! is_office_ip "192.168.12.10"; then
  ok "is_office_ip fingerprint"
else
  bad "is_office_ip fingerprint"
fi

SUMMARY_OK='server_identifier (ip): 10.1.200.1
domain_name (string): medusa.local
Router : 172.29.0.1'
SUMMARY_BAD='Router : 192.168.68.1'
if summary_looks_office "$SUMMARY_OK" && ! summary_looks_office "$SUMMARY_BAD"; then
  ok "summary_looks_office fingerprint"
else
  bad "summary_looks_office fingerprint"
fi

if captive_body_ok '<HTML><HEAD><TITLE>Success</TITLE></HEAD><BODY>Success</BODY></HTML>' \
  && ! captive_body_ok '<HTML><HEAD><TITLE>Hotspot Login</TITLE></HEAD></HTML>'; then
  ok "captive_body_ok Success detection"
else
  bad "captive_body_ok Success detection"
fi

# Installer into temp HOME (no launchctl, no sudoers prompt)
HOME="$TMP/home" \
  OFFICE_WIFI_INSTALL_SKIP_LAUNCHCTL=1 \
  OFFICE_WIFI_INSTALL_SKIP_SUDOERS_PROMPT=1 \
  bash "$INSTALLER" > "$TMP/install.out"
if [[ -x "$TMP/home/.local/bin/office-wifi-captive-heal.sh" \
   && -x "$TMP/home/.local/bin/office-wifi-privileged-helper.sh" \
   && -f "$TMP/home/Library/LaunchAgents/com.igor.office-wifi-captive-heal.plist" ]]; then
  ok "installer places scripts + plist under HOME"
else
  bad "installer missing artifacts"
fi
if grep -q "$TMP/home/.local/bin/office-wifi-captive-heal.sh" \
  "$TMP/home/Library/LaunchAgents/com.igor.office-wifi-captive-heal.plist" \
  && ! grep -E '/private/tmp|actions-runner/_work|--dry-run' \
  "$TMP/home/Library/LaunchAgents/com.igor.office-wifi-captive-heal.plist" >/dev/null; then
  ok "installed plist uses durable HOME path"
else
  bad "installed plist path contract failed"
fi
if grep -q 'NOPASSWD' "$INSTALLER" && grep -q 'office-wifi-privileged-helper.sh' "$INSTALLER" \
  && ! grep -q '/bin/rm' "$INSTALLER"; then
  ok "sudoers install is helper-only (no blanket /bin/rm)"
else
  bad "sudoers install is too broad or missing"
fi
if ! grep -E 'preferences\.plist|NetworkInterfaces\.plist' "$HEAL" | grep -v 'never\|NEVER\|without touching' >/dev/null; then
  ok "healer never targets preferences.plist / NetworkInterfaces.plist for deletion"
else
  # Explicit allowlist: mentions must be refusal comments only
  if grep -E 'rm .*preferences\.plist|rm .*NetworkInterfaces' "$HEAL" >/dev/null; then
    bad "healer deletes forbidden SystemConfiguration plists"
  else
    ok "healer never targets preferences.plist / NetworkInterfaces.plist for deletion"
  fi
fi

echo
echo "=== $pass passed, $fail failed ==="
[[ "$fail" -eq 0 ]]
