#!/usr/bin/env bash
# Revenue anomaly watchdog for ThumbGate/Leash.
#
# Reads ONLY the public, unauthenticated /api/health endpoint (same source
# the AdminClient revenue panel and saas-watchdog.sh already read) — never
# touches D1 directly, never writes/mutates billing state. Purely read + alert.
#
# Fires an ntfy.sh alert (same topic/curl/header conventions as
# saas/saas-watchdog.sh) when EITHER:
#   (a) billingEventsLast24h has been 0 for 2+ consecutive checks in a row,
#       AND it was genuinely nonzero within the recent window (default 7
#       days) — i.e. billing activity that WAS happening has gone silent.
#       This does not fire on an app that has simply never had billing
#       activity (no false alarm on a fresh/dev environment).
#   (b) paidOrganizationsTotal drops between this check and the previous
#       check — a real churn/cancellation signal, never fired on an increase.
#
# Idempotent: a first run with no prior state establishes a baseline and
# never alerts; the silent-webhook alert only fires on the transition into
# the anomaly (and sends one recovery notice on the transition out); the
# org-drop alert is naturally edge-triggered (each drop is only "new" once,
# since the next check's "previous" becomes the lower value).
set -uo pipefail

APP_URL="${HERMES_APP_URL:-https://thumbgate.app}"
NTFY_TOPIC="${REVENUE_ANOMALY_NTFY_TOPIC:-${SAAS_WATCHDOG_NTFY_TOPIC:-yolo-guard-fdh8ktuw1vtxb5sb}}"
NTFY_URL="${REVENUE_ANOMALY_NTFY_URL:-https://ntfy.sh/$NTFY_TOPIC}"
STATE_FILE="${REVENUE_ANOMALY_STATE_FILE:-$HOME/.hermes/revenue-anomaly-state.env}"
# "Recently" nonzero, in ms. Default 7 days.
RECENT_WINDOW_MS="${REVENUE_ANOMALY_RECENT_WINDOW_MS:-604800000}"
CURL="${CURL_BIN:-/usr/bin/curl}"

json_number_or_null() {
  local payload="$1"
  local key="$2"
  printf '%s' "$payload" | /usr/bin/sed -nE "s/.*\"${key}\":[[:space:]]*([0-9]+|null).*/\1/p" | /usr/bin/head -n 1
}

health_body="$("$CURL" -sS -m 15 -A "ThumbGate-RevenueAnomaly/1" "$APP_URL/api/health" 2>/dev/null || true)"
if [ -z "$health_body" ]; then
  echo "revenue-anomaly-watchdog: no response from $APP_URL/api/health — skipping this check (transient, not an anomaly verdict)"
  exit 0
fi

billing_events_24h="$(json_number_or_null "$health_body" billingEventsLast24h)"
paid_orgs="$(json_number_or_null "$health_body" paidOrganizationsTotal)"

if [ -z "$billing_events_24h" ] || [ "$billing_events_24h" = null ] || [ -z "$paid_orgs" ] || [ "$paid_orgs" = null ]; then
  echo "revenue-anomaly-watchdog: health payload missing telemetry fields — skipping this check"
  exit 0
fi

now_ms=$(( $(date -u +%s) * 1000 ))

# Defaults for a brand-new/missing state file. A first run only ever
# establishes a baseline: it must never alert.
prev_paid_orgs=""
last_nonzero_billing_at=""
consecutive_zero=0
silent_alert_active=false

# shellcheck disable=SC1090
[ -f "$STATE_FILE" ] && . "$STATE_FILE"

is_first_run=false
[ -z "$prev_paid_orgs" ] && is_first_run=true

if [ "$billing_events_24h" -gt 0 ] 2>/dev/null; then
  new_last_nonzero_at="$now_ms"
  new_consecutive_zero=0
else
  new_last_nonzero_at="${last_nonzero_billing_at:-}"
  new_consecutive_zero=$(( consecutive_zero + 1 ))
fi

recent_activity=false
if [ -n "$new_last_nonzero_at" ]; then
  age=$(( now_ms - new_last_nonzero_at ))
  [ "$age" -le "$RECENT_WINDOW_MS" ] && recent_activity=true
fi

silent_condition=false
if [ "$is_first_run" = false ] \
  && [ "$billing_events_24h" -eq 0 ] 2>/dev/null \
  && [ "$new_consecutive_zero" -ge 2 ] \
  && [ "$recent_activity" = true ]; then
  silent_condition=true
fi

org_drop_condition=false
org_drop_detail=""
if [ "$is_first_run" = false ] && [ -n "$prev_paid_orgs" ] \
  && [ "$paid_orgs" -lt "$prev_paid_orgs" ] 2>/dev/null; then
  org_drop_condition=true
  org_drop_detail="paidOrganizationsTotal dropped from $prev_paid_orgs to $paid_orgs"
fi

ts="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

alert() {
  local title="$1" priority="$2" body="$3"
  "$CURL" -sS -m 10 -H "Title: $title" -H "Priority: $priority" \
    -d "$body" "$NTFY_URL" >/dev/null 2>&1 || true
}

if [ "$silent_condition" = true ] && [ "$silent_alert_active" != true ]; then
  minutes_since_activity="unknown"
  [ -n "$new_last_nonzero_at" ] && minutes_since_activity=$(( (now_ms - new_last_nonzero_at) / 60000 ))
  alert "ThumbGate revenue: billing webhook may be silent" high \
    "billingEventsLast24h=0 for ${new_consecutive_zero} consecutive checks (last real billing activity ~${minutes_since_activity} min ago) at $ts — check Stripe webhook delivery to $APP_URL/api/billing/webhook."
  silent_alert_active=true
elif [ "$billing_events_24h" -gt 0 ] 2>/dev/null && [ "$silent_alert_active" = true ]; then
  alert "ThumbGate revenue: billing events resumed" default \
    "billingEventsLast24h=${billing_events_24h} at $ts — webhook silence cleared."
  silent_alert_active=false
fi

if [ "$org_drop_condition" = true ]; then
  alert "ThumbGate revenue: paid organizations dropped" high \
    "$org_drop_detail at $ts — possible churn/cancellation; check billing_events for customer.subscription.deleted/updated near this time."
fi

mkdir -p "$(dirname "$STATE_FILE")"
{
  printf 'prev_billing_events=%s\n' "$billing_events_24h"
  printf 'prev_paid_orgs=%s\n' "$paid_orgs"
  printf 'last_nonzero_billing_at=%s\n' "$new_last_nonzero_at"
  printf 'consecutive_zero=%s\n' "$new_consecutive_zero"
  printf 'silent_alert_active=%s\n' "$silent_alert_active"
} > "$STATE_FILE"

echo "revenue-anomaly-watchdog $ts firstRun=$is_first_run billingEventsLast24h=$billing_events_24h paidOrganizationsTotal=$paid_orgs consecutiveZero=$new_consecutive_zero silentCondition=$silent_condition orgDrop=$org_drop_condition"
