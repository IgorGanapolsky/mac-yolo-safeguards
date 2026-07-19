#!/usr/bin/env bash
# fleet-heartbeat - periodic self-check that only speaks when something warrants it.
#
# The research (docs/FLEET-AUTONOMY-RESEARCH-2026-07.md) found that no shipped agent
# treats "stay silent" as an explicit action. This is that missing decision policy in
# read-only form: each wake collects concerns; if the concern list is EMPTY it exits
# silently (the default, most wakes). If non-empty it emits ONE consolidated ntfy
# digest. It never mutates anything — its whole job is to notice when the fleet's OWN
# automation has silently died (the failure class in memory: dead launchd worktree
# paths, a killed gateway, a re-armed zero-spend gate, a stalled sentinel).
set -euo pipefail

NTFY_TOPIC="${FLEET_HEARTBEAT_NTFY_TOPIC:-yolo-guard-fdh8ktuw1vtxb5sb}"
# LiteLLM's /health runs real per-model probes and can hang; /health/liveliness is the
# fast liveness path ("I'm alive!"). Use it so a busy gateway isn't misread as dead.
GATEWAY_URL="${FLEET_GATEWAY_URL:-http://127.0.0.1:4010/health/liveliness}"
ZERO_SPEND_MARKER="${HERMES_ZERO_SPEND_MARKER:-$HOME/.hermes/NO_PAID_SPEND}"
CURL="${CURL_BIN:-/usr/bin/curl}"
LAUNCHCTL="${LAUNCHCTL_BIN:-/bin/launchctl}"
UID_NUM="${FLEET_UID:-$(id -u)}"
# space-separated launchd labels that MUST be alive (last exit 0 in `launchctl list`)
WATCH_LABELS="${FLEET_WATCH_LABELS:-com.igor.external-pr-watch com.igor.hermes-litellm}"
# log files that should be fresh; "label:path:max_age_seconds" space-separated (optional)
FRESH_LOGS="${FLEET_FRESH_LOGS:-}"

concerns=()

# 1. gateway health (informational unless zero-spend is off — a dead gateway then means
#    the fleet has no paid route). A 000/failed curl is the concern, not the HTTP body.
if [ ! -e "$ZERO_SPEND_MARKER" ]; then
  if ! "$CURL" -fsS -m 5 "$GATEWAY_URL" >/dev/null 2>&1; then
    concerns+=("gateway :4010 not answering ($GATEWAY_URL) while paid spend is ENABLED — no model route")
  fi
fi

# 2. watched launchd jobs — a label absent from `launchctl list`, or present with a
#    non-zero last-exit status, means an autonomous job died.
list="$("$LAUNCHCTL" list 2>/dev/null || true)"
for label in $WATCH_LABELS; do
  line="$(printf '%s\n' "$list" | /usr/bin/awk -v l="$label" '$3==l{print}')"
  if [ -z "$line" ]; then
    concerns+=("launchd job MISSING: $label (not loaded)")
  else
    pid="$(printf '%s\n' "$line" | /usr/bin/awk '{print $1}')"
    status="$(printf '%s\n' "$line" | /usr/bin/awk '{print $2}')"
    # A live PID (numeric col1) means the job is currently running — a stale non-zero
    # last-exit (e.g. -15 from a prior KeepAlive restart) is NOT a failure. Only flag a
    # non-zero status when the job is NOT currently running (col1 == "-").
    if [ "$pid" = "-" ]; then
      case "$status" in
        ''|'-'|0) : ;;
        *) concerns+=("launchd job $label not running; last exit=$status") ;;
      esac
    fi
  fi
done

# 3. optional log-freshness checks (a sentinel that stopped writing = silently stalled)
now="$(date +%s)"
for spec in $FRESH_LOGS; do
  lbl="${spec%%:*}"; rest="${spec#*:}"; path="${rest%%:*}"; maxage="${rest##*:}"
  if [ ! -f "$path" ]; then
    concerns+=("$lbl log missing: $path")
    continue
  fi
  mtime="$(/usr/bin/stat -f %m "$path" 2>/dev/null || echo 0)"
  age=$(( now - mtime ))
  if [ "$age" -gt "$maxage" ]; then
    concerns+=("$lbl log stale: $path last written ${age}s ago (>${maxage}s)")
  fi
done

# Decision policy: stay silent unless something warrants attention.
if [ "${#concerns[@]}" -eq 0 ]; then
  echo "fleet-heartbeat: all clear ($(date '+%Y-%m-%d %H:%M:%S')) — staying silent"
  exit 0
fi

body="$(printf 'fleet-heartbeat found %d concern(s):\n' "${#concerns[@]}"; printf ' - %s\n' "${concerns[@]}")"
echo "$body"
"$CURL" -fsS -m 10 -H "Title: Fleet heartbeat: ${#concerns[@]} concern(s)" -H "Priority: high" \
  -d "$body" "https://ntfy.sh/$NTFY_TOPIC" >/dev/null 2>&1 || true
exit 0
