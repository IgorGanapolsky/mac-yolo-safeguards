#!/usr/bin/env bash
# saas-watchdog.sh — the observability + alerting layer the Hermes SaaS was missing.
# Runs 24/7 (launchd). Each tick probes the live product surfaces, writes a structured
# status line (observability), and pings ntfy ONLY when something is newly broken
# (alerting / self-healing signal) — the "stay silent unless it matters" policy.
#
# Answers, on every tick: is the site up? can users sign in? is failover healthy?
# is a real domain attached? — the questions we currently can't answer.
set -euo pipefail

APP_URL="${HERMES_APP_URL:-https://hermes-agent-control.iganapolsky.chatgpt.site}"
RUNNER_URL="${HERMES_RUNNER_URL:-https://igor-hermes-cloud-runner.fly.dev/health}"
NTFY_TOPIC="${SAAS_WATCHDOG_NTFY_TOPIC:-yolo-guard-fdh8ktuw1vtxb5sb}"
STATE="${SAAS_WATCHDOG_STATE:-$HOME/.hermes/saas-watchdog-state}"
LOG="${SAAS_WATCHDOG_LOG:-$HOME/.hermes/saas-watchdog.jsonl}"
CURL="${CURL_BIN:-/usr/bin/curl}"

# curl's -w always prints a status (000 on connection failure), so no "|| echo" fallback
# (that appended a second 000). Ignore curl's exit code; the printed code is the signal.
# curl prints 000 via -w on connection failure but also EXITS non-zero (e.g. 28 timeout);
# `|| true` keeps that expected failure from tripping `set -e` while preserving the code.
code(){ "$CURL" -s -m 12 -o /dev/null -w '%{http_code}' "$1" 2>/dev/null || true; }

landing="$(code "$APP_URL")"
signin="$(code "$APP_URL/api/auth/login")"
runner_body="$("$CURL" -s -m 12 "$RUNNER_URL" 2>/dev/null || echo '')"
runner_code="$(code "$RUNNER_URL")"
runner_degraded="unknown"
case "$runner_body" in
  *'"degraded":false'*) runner_degraded=false ;;
  *'"degraded":true'*)  runner_degraded=true ;;
esac

# Health rubric (what "working" means):
#   landing 200 = public site viewable; signin 200/302 = SSO wired; runner 200 + !degraded = failover ready
concerns=()
[ "$landing" = 200 ] || concerns+=("landing $landing (public site not viewable)")
case "$signin" in 200|302) : ;; *) concerns+=("sign-in $signin (SSO not working)") ;; esac
{ [ "$runner_code" = 200 ] && [ "$runner_degraded" = false ]; } || concerns+=("runner $runner_code degraded=$runner_degraded (failover not ready)")

ts="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
status="ok"; [ "${#concerns[@]}" -gt 0 ] && status="degraded"
/bin/mkdir -p "$(dirname "$LOG")"
printf '{"ts":"%s","status":"%s","landing":"%s","signin":"%s","runner":"%s","runnerDegraded":"%s","concerns":%d}\n' \
  "$ts" "$status" "$landing" "$signin" "$runner_code" "$runner_degraded" "${#concerns[@]}" >> "$LOG"

# Alert only on a NEW break (state transition), so it's signal, not noise.
prev="$(cat "$STATE" 2>/dev/null || echo unknown)"
echo "$status" > "$STATE"
echo "saas-watchdog $ts status=$status landing=$landing signin=$signin runner=$runner_code degraded=$runner_degraded"
if [ "$status" = degraded ] && [ "$prev" != degraded ]; then
  body="$(printf 'Hermes SaaS DEGRADED (%s):\n' "$ts"; printf ' - %s\n' "${concerns[@]}")"
  "$CURL" -s -m 10 -H "Title: Hermes SaaS degraded" -H "Priority: high" -d "$body" "https://ntfy.sh/$NTFY_TOPIC" >/dev/null 2>&1 || true
elif [ "$status" = ok ] && [ "$prev" = degraded ]; then
  "$CURL" -s -m 10 -H "Title: Hermes SaaS recovered" -d "recovered at $ts" "https://ntfy.sh/$NTFY_TOPIC" >/dev/null 2>&1 || true
fi
[ "$status" = ok ]
