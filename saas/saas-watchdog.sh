#!/usr/bin/env bash
# Production observability probe for ThumbGate. The watchdog verifies public
# routing, security policy, AuthKit callback acceptance, API/analytics readback,
# webhook enforcement, Workers.dev fallback, and cloud-runner health. It records
# aggregate freshness only; URLs containing OAuth state and customer data never
# enter the log.
set -uo pipefail

APP_URL="${HERMES_APP_URL:-https://thumbgate.app}"
APP_ALIAS_URL="${HERMES_APP_ALIAS_URL:-https://app.thumbgate.app}"
HTTP_APP_URL="${HERMES_HTTP_APP_URL:-http://thumbgate.app}"
WORKERS_URL="${HERMES_WORKERS_URL:-https://hermes-control-plane.iganapolsky.workers.dev}"
RUNNER_URL="${HERMES_RUNNER_URL:-https://igor-hermes-cloud-runner.fly.dev/health}"
NTFY_TOPIC="${SAAS_WATCHDOG_NTFY_TOPIC:-yolo-guard-fdh8ktuw1vtxb5sb}"
STATE="${SAAS_WATCHDOG_STATE:-$HOME/.hermes/saas-watchdog-state}"
LOG="${SAAS_WATCHDOG_LOG:-$HOME/.hermes/saas-watchdog.jsonl}"
CURL="${CURL_BIN:-/usr/bin/curl}"

code() {
  local result
  result="$("$CURL" -sS -m 15 -A "ThumbGate-Watchdog/1" -o /dev/null -w '%{http_code}' "$1" 2>/dev/null || true)"
  printf '%s' "${result:-000}"
}

body() {
  "$CURL" -sS -m 15 -A "ThumbGate-Watchdog/1" "$1" 2>/dev/null || true
}

signin_chain() {
  local result
  result="$("$CURL" -sS -L --max-redirs 6 -m 20 -A "Mozilla/5.0 ThumbGate-Watchdog/1" \
    -o /dev/null -w '%{http_code}|%{url_effective}' "$1/api/auth/login" 2>/dev/null || true)"
  printf '%s' "${result:-000|unavailable}"
}

json_number_or_null() {
  local payload="$1"
  local key="$2"
  printf '%s' "$payload" | /usr/bin/sed -nE "s/.*\"${key}\":[[:space:]]*([0-9]+|null).*/\1/p" | /usr/bin/head -n 1
}

landing="$(code "$APP_URL")"
alias_landing="$(code "$APP_ALIAS_URL")"
workers_health="$(code "$WORKERS_URL/api/health")"

redirect_probe="$("$CURL" -sS -m 15 -A "ThumbGate-Watchdog/1" -o /dev/null \
  -w '%{http_code}|%{redirect_url}' "$HTTP_APP_URL" 2>/dev/null || true)"
redirect_code="${redirect_probe%%|*}"
redirect_target="${redirect_probe#*|}"

headers="$("$CURL" -sS -m 15 -A "ThumbGate-Watchdog/1" -D - -o /dev/null "$APP_URL" 2>/dev/null || true)"
if printf '%s\n' "$headers" | /usr/bin/awk 'tolower($0) ~ /^strict-transport-security:[[:space:]]*max-age=/ { found=1 } END { exit found ? 0 : 1 }'; then
  hsts=true
else
  hsts=false
fi

health_code="$(code "$APP_URL/api/health")"
health_body="$(body "$APP_URL/api/health")"
plan_code="$(code "$APP_URL/api/billing/plan")"
plan_body="$(body "$APP_URL/api/billing/plan")"
# /api/me is intentionally 200 + authenticated:false for landing chrome (not a private gate).
session_code="$(code "$APP_URL/api/me")"
session_body="$(body "$APP_URL/api/me")"
# Real private-surface gate: unauthenticated tasks must be 401.
private_tasks_code="$(code "$APP_URL/api/tasks")"

signin_probe="$(signin_chain "$APP_URL")"
signin_code="${signin_probe%%|*}"
signin_final="${signin_probe#*|}"
alias_signin_probe="$(signin_chain "$APP_ALIAS_URL")"
alias_signin_code="${alias_signin_probe%%|*}"
alias_signin_final="${alias_signin_probe#*|}"

analytics_code="$("$CURL" -sS -m 15 -A "ThumbGate-Watchdog/1" -X POST \
  -H 'content-type: application/json' -H "origin: $APP_URL" \
  --data '{"schemaVersion":1,"event":"watchdog_probe"}' \
  -o /dev/null -w '%{http_code}' "$APP_URL/api/analytics/event" 2>/dev/null || true)"
webhook_code="$("$CURL" -sS -m 15 -A "ThumbGate-Watchdog/1" -X POST \
  -H 'content-type: application/json' --data '{}' \
  -o /dev/null -w '%{http_code}' "$APP_URL/api/billing/webhook" 2>/dev/null || true)"

# Read after the synthetic event so a 204 without a durable write cannot pass.
health_after_body="$(body "$APP_URL/api/health")"
analytics_latest_at="$(json_number_or_null "$health_after_body" analyticsLatestAt)"
audit_latest_at="$(json_number_or_null "$health_after_body" auditLatestAt)"
device_heartbeat_latest_at="$(json_number_or_null "$health_after_body" deviceHeartbeatLatestAt)"
billing_event_latest_at="$(json_number_or_null "$health_after_body" billingEventLatestAt)"
real_billing_event_latest_at="$(json_number_or_null "$health_after_body" realBillingEventLatestAt)"
checkout_created_last_24h="$(json_number_or_null "$health_after_body" checkoutCreatedLast24h)"
checkout_failed_last_24h="$(json_number_or_null "$health_after_body" checkoutFailedLast24h)"
portal_created_last_24h="$(json_number_or_null "$health_after_body" portalCreatedLast24h)"
portal_failed_last_24h="$(json_number_or_null "$health_after_body" portalFailedLast24h)"
billing_events_last_24h="$(json_number_or_null "$health_after_body" billingEventsLast24h)"
paid_organizations_total="$(json_number_or_null "$health_after_body" paidOrganizationsTotal)"
plan_unit_amount="$(json_number_or_null "$plan_body" unitAmount)"

runner_body="$(body "$RUNNER_URL")"
runner_code="$(code "$RUNNER_URL")"
runner_degraded=unknown
case "$runner_body" in
  *'"degraded":false'*) runner_degraded=false ;;
  *'"degraded":true'*) runner_degraded=true ;;
esac

concerns=()
[ "$landing" = 200 ] || concerns+=("landing $landing")
[ "$alias_landing" = 200 ] || concerns+=("app alias $alias_landing")
case "$redirect_code" in 301|302|307|308) : ;; *) concerns+=("HTTP redirect $redirect_code") ;; esac
case "$redirect_target" in https://thumbgate.app/*|https://thumbgate.app) : ;; *) concerns+=("HTTP redirect target invalid") ;; esac
[ "$hsts" = true ] || concerns+=("HSTS missing")
[ "$health_code" = 200 ] || concerns+=("health $health_code")
case "$health_body" in *'"ok":true'*'"ready":true'*'"status":"ok"'*'"database":"available"'*'"schema":"current"'*) : ;; *) concerns+=("health payload invalid or not ready") ;; esac
case "$health_body" in *'"workosAuthConfigured":true'*'"stripeCheckoutConfigured":true'*'"stripeWebhookConfigured":true'*'"cloudRunnerConfigured":true'*) : ;; *) concerns+=("production configuration incomplete") ;; esac
[ "$workers_health" = 200 ] || concerns+=("Workers.dev health $workers_health")
# Accept either legacy 401 or intentional public 200 + authenticated:false.
session_ok=false
if [ "$session_code" = 401 ]; then
  session_ok=true
elif [ "$session_code" = 200 ]; then
  case "$session_body" in
    *'"authenticated":false'*|*'\"authenticated\":false'*|*'\"authenticated\": false'*|*'\"authenticated\": false'*) session_ok=true ;;
    *'"authenticated": false'*) session_ok=true ;;
  esac
fi
[ "$session_ok" = true ] || concerns+=("anonymous /api/me gate $session_code")
[ "$private_tasks_code" = 401 ] || concerns+=("anonymous /api/tasks gate $private_tasks_code")
[ "$plan_code" = 200 ] || concerns+=("billing plan $plan_code")
case "$plan_body" in *'"configured":true'*'"active":true'*'"unitAmount":'*'"currency":'*'"interval":'*) : ;; *) concerns+=("billing plan payload invalid") ;; esac
case "$plan_unit_amount" in ''|null|0) concerns+=("billing plan amount invalid") ;; esac

signin_ok=false
if [ "$signin_code" = 200 ]; then
  case "$signin_final" in
    *redirect-uri-invalid*) : ;;
    *authkit.app*|*workos.com/sso*|*workos.com/user_management*) signin_ok=true ;;
  esac
fi
[ "$signin_ok" = true ] || concerns+=("primary AuthKit chain failed")

alias_signin_ok=false
if [ "$alias_signin_code" = 200 ]; then
  case "$alias_signin_final" in
    *redirect-uri-invalid*) : ;;
    *authkit.app*|*workos.com/sso*|*workos.com/user_management*) alias_signin_ok=true ;;
  esac
fi
[ "$alias_signin_ok" = true ] || concerns+=("app alias AuthKit chain failed")

[ "$analytics_code" = 204 ] || concerns+=("analytics ingest $analytics_code")
case "$analytics_latest_at" in ''|null) concerns+=("analytics readback missing") ;; esac
[ "$webhook_code" = 401 ] || concerns+=("webhook signature gate $webhook_code")
{ [ "$runner_code" = 200 ] && [ "$runner_degraded" = false ]; } || concerns+=("runner $runner_code degraded=$runner_degraded")

ts="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
status=ok
[ "${#concerns[@]}" -gt 0 ] && status=degraded
/bin/mkdir -p "$(dirname "$LOG")"
printf '{"ts":"%s","status":"%s","landing":"%s","aliasLanding":"%s","httpRedirect":"%s","hsts":%s,"health":"%s","workersHealth":"%s","signinChain":%s,"aliasSigninChain":%s,"sessionGate":"%s","privateTasksGate":"%s","billingPlan":"%s","billingUnitAmount":"%s","analyticsIngest":"%s","analyticsLatestAt":"%s","auditLatestAt":"%s","deviceHeartbeatLatestAt":"%s","billingEventLatestAt":"%s","realBillingEventLatestAt":"%s","checkoutCreatedLast24h":"%s","checkoutFailedLast24h":"%s","portalCreatedLast24h":"%s","portalFailedLast24h":"%s","billingEventsLast24h":"%s","paidOrganizationsTotal":"%s","webhookGate":"%s","runner":"%s","runnerDegraded":"%s","concerns":%d}\n' \
  "$ts" "$status" "$landing" "$alias_landing" "$redirect_code" "$hsts" "$health_code" "$workers_health" \
  "$signin_ok" "$alias_signin_ok" "$session_code" "$private_tasks_code" "$plan_code" "${plan_unit_amount:-unknown}" "$analytics_code" "${analytics_latest_at:-unknown}" \
  "${audit_latest_at:-unknown}" "${device_heartbeat_latest_at:-unknown}" "${billing_event_latest_at:-unknown}" \
  "${real_billing_event_latest_at:-unknown}" "${checkout_created_last_24h:-unknown}" "${checkout_failed_last_24h:-unknown}" \
  "${portal_created_last_24h:-unknown}" "${portal_failed_last_24h:-unknown}" \
  "${billing_events_last_24h:-unknown}" "${paid_organizations_total:-unknown}" "$webhook_code" "$runner_code" "$runner_degraded" "${#concerns[@]}" >> "$LOG"

prev="$(/bin/cat "$STATE" 2>/dev/null || echo unknown)"
printf '%s\n' "$status" > "$STATE"
echo "saas-watchdog $ts status=$status landing=$landing alias=$alias_landing health=$health_code analytics=$analytics_code runner=$runner_code degraded=$runner_degraded concerns=${#concerns[@]}"
if [ "$status" = degraded ] && [ "$prev" != degraded ]; then
  alert_body="$(printf 'ThumbGate DEGRADED (%s):\n' "$ts"; printf ' - %s\n' "${concerns[@]}")"
  "$CURL" -sS -m 10 -H "Title: ThumbGate degraded" -H "Priority: high" \
    -d "$alert_body" "https://ntfy.sh/$NTFY_TOPIC" >/dev/null 2>&1 || true
elif [ "$status" = ok ] && [ "$prev" = degraded ]; then
  "$CURL" -sS -m 10 -H "Title: ThumbGate recovered" \
    -d "recovered at $ts" "https://ntfy.sh/$NTFY_TOPIC" >/dev/null 2>&1 || true
fi

[ "$status" = ok ]
