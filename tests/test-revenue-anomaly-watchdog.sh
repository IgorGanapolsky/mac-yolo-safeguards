#!/usr/bin/env bash
# Fast, network-free unit test for saas/revenue-anomaly-watchdog.sh logic:
# fake curl stands in for both the /api/health read and the ntfy.sh alert
# POST, driven purely by an env-supplied JSON body per run, so the full
# consecutive-check state machine can be exercised without a real Worker or
# D1. The slower, real-D1 end-to-end proof lives at
# apps/hermes-control-plane/tests/revenue-anomaly-watchdog-smoke.mjs.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TMP="$(mktemp -d "${TMPDIR:-/tmp}/thumbgate-revenue-anomaly-test.XXXXXX")"
trap 'rm -rf -- "$TMP"' EXIT

FAKE_CURL="$TMP/fake-curl"
cat >"$FAKE_CURL" <<'FAKE'
#!/usr/bin/env bash
set -u
printf '%s\n' "$*" >>"${FAKE_CURL_LOG:?}"
args=("$@")
url="${args[${#args[@]}-1]}"
case "$url" in
  */api/health) printf '%s' "${FAKE_HEALTH_BODY:?FAKE_HEALTH_BODY unset}" ;;
  https://ntfy.sh/*) exit 0 ;;
  *) printf '{}' ;;
esac
FAKE
chmod 700 "$FAKE_CURL"

health_json() {
  local billing="$1" paid="$2"
  printf '{"ok":true,"telemetry":{"billingEventsLast24h":%s,"paidOrganizationsTotal":%s}}' "$billing" "$paid"
}

run_check() {
  local billing="$1" paid="$2"
  FAKE_HEALTH_BODY="$(health_json "$billing" "$paid")" \
  FAKE_CURL_LOG="$TMP/curl.log" \
  CURL_BIN="$FAKE_CURL" \
  REVENUE_ANOMALY_STATE_FILE="$TMP/state.env" \
  bash "$ROOT/saas/revenue-anomaly-watchdog.sh"
}

alert_count() {
  grep -c -- "-H Title: $1" "$TMP/curl.log" 2>/dev/null || true
}

any_alert_count() {
  grep -c -- "https://ntfy.sh/" "$TMP/curl.log" 2>/dev/null || true
}

# --- Scenario 1: healthy baseline, then unchanged — must stay silent. ---
: >"$TMP/curl.log"
run_check 5 3 >/dev/null   # first run: establishes baseline, must never alert
[ "$(any_alert_count)" = 0 ] || { echo "FAIL: first run alerted"; exit 1; }
grep -q 'prev_billing_events=5' "$TMP/state.env"
grep -q 'prev_paid_orgs=3' "$TMP/state.env"

run_check 5 3 >/dev/null   # unchanged, healthy — still silent
[ "$(any_alert_count)" = 0 ] || { echo "FAIL: healthy unchanged run alerted"; exit 1; }
echo "PASS: healthy/unchanged stays silent"

# --- Scenario 2: webhook goes silent for 2+ checks in a row. ---
run_check 0 3 >/dev/null   # 1st zero check — must NOT alert yet
[ "$(alert_count 'ThumbGate revenue: billing webhook may be silent')" = 0 ] \
  || { echo "FAIL: alerted on a single zero check"; exit 1; }

run_check 0 3 >/dev/null   # 2nd consecutive zero check — MUST alert
[ "$(alert_count 'ThumbGate revenue: billing webhook may be silent')" = 1 ] \
  || { echo "FAIL: did not alert on 2nd consecutive zero check"; exit 1; }
grep -q 'silent_alert_active=true' "$TMP/state.env"
echo "PASS: silent-webhook alert fires on 2nd consecutive zero check"

run_check 0 3 >/dev/null   # still silent — must NOT re-alert (transition-only)
[ "$(alert_count 'ThumbGate revenue: billing webhook may be silent')" = 1 ] \
  || { echo "FAIL: re-alerted on an already-active silent condition"; exit 1; }
echo "PASS: silent-webhook alert does not spam while condition persists"

# --- Scenario 3: recovery clears the alert with one recovered notice. ---
run_check 2 3 >/dev/null
[ "$(alert_count 'ThumbGate revenue: billing events resumed')" = 1 ] \
  || { echo "FAIL: no recovery notice after billing events resumed"; exit 1; }
grep -q 'silent_alert_active=false' "$TMP/state.env"
echo "PASS: recovery notice fires exactly once"

# --- Scenario 4: paid org count drop fires a churn alert. ---
run_check 2 2 >/dev/null   # paidOrganizationsTotal 3 -> 2
[ "$(alert_count 'ThumbGate revenue: paid organizations dropped')" = 1 ] \
  || { echo "FAIL: no alert on paid organization drop"; exit 1; }
grep -q 'paidOrganizationsTotal dropped from 3 to 2' "$TMP/curl.log"
echo "PASS: org-count-drop alert fires with correct before/after in the body"

# --- Scenario 5: org count increase must NEVER alert. ---
run_check 2 4 >/dev/null   # 2 -> 4, an increase
[ "$(alert_count 'ThumbGate revenue: paid organizations dropped')" = 1 ] \
  || { echo "FAIL: org-drop alert count changed on an increase"; exit 1; }
echo "PASS: paid organization increase never alerts"

# --- Scenario 6: org count unchanged after that — silent. ---
run_check 2 4 >/dev/null
[ "$(alert_count 'ThumbGate revenue: paid organizations dropped')" = 1 ] \
  || { echo "FAIL: unchanged org count re-alerted"; exit 1; }
echo "PASS: unchanged paid organization count stays silent"

# --- Scenario 7: an environment with NO recent billing activity never
# false-alarms just because it has always been zero (e.g. fresh/dev). ---
rm -f "$TMP/state.env"
: >"$TMP/curl.log"
run_check 0 0 >/dev/null   # baseline: always been zero
run_check 0 0 >/dev/null
run_check 0 0 >/dev/null
[ "$(alert_count 'ThumbGate revenue: billing webhook may be silent')" = 0 ] \
  || { echo "FAIL: false-alarmed on an environment that was never active"; exit 1; }
echo "PASS: never-active environment does not false-alarm"

echo "ALL PASS: revenue-anomaly-watchdog.sh"
