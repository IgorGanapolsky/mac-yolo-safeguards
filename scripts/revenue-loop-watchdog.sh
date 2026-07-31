#!/usr/bin/env bash
# Watchdog for the two revenue-loop LaunchAgents (com.igor.revenue-autonomous-loop,
# com.igor.ralph-gsd-loop). Born from a real incident: both jobs were silently dead
# for TWO DAYS (2026-07-24 to 2026-07-26) because their plist WorkingDirectory
# pointed at a git worktree that got deleted after its PR merged. launchd could not
# spawn the process (exit 78 = launchd's own EX_CONFIG, never even reached the
# Node script), retried forever on a fixed interval with zero backoff, and nothing
# detected or alerted on it — a human had to run `launchctl list` manually to notice.
#
# Every N minutes (see com.igor.revenue-loop-watchdog.plist) this checks, per job:
#   (a) does the plist's WorkingDirectory still exist as a directory
#   (b) is launchd's LastExitStatus for the job non-zero
#   (c) has stdout/stderr produced fresh output within 2x the job's own StartInterval
# and ntfy-alerts on the ok->degraded transition (and again on recovery), matching
# the edge-triggered alerting saas-watchdog.sh already uses.
#
# All external commands and paths are env-overridable so this is unit testable
# without touching the real Mac (see tests/test-revenue-loop-watchdog.sh).
set -uo pipefail

ID_BIN="${REVENUE_WATCHDOG_ID_BIN:-id}"
LAUNCH_AGENTS_DIR="${REVENUE_WATCHDOG_LAUNCH_AGENTS_DIR:-$HOME/Library/LaunchAgents}"
PLISTBUDDY_BIN="${REVENUE_WATCHDOG_PLISTBUDDY_BIN:-/usr/libexec/PlistBuddy}"
LAUNCHCTL_BIN="${REVENUE_WATCHDOG_LAUNCHCTL_BIN:-launchctl}"
STAT_BIN="${REVENUE_WATCHDOG_STAT_BIN:-stat}"
CURL_BIN="${REVENUE_WATCHDOG_CURL_BIN:-curl}"
GUI_DOMAIN="${REVENUE_WATCHDOG_GUI_DOMAIN:-gui/$($ID_BIN -u)}"
NTFY_TOPIC="${REVENUE_WATCHDOG_NTFY_TOPIC:-yolo-guard-fdh8ktuw1vtxb5sb}"
NTFY_URL="${REVENUE_WATCHDOG_NTFY_URL:-https://ntfy.sh/$NTFY_TOPIC}"
STATE="${REVENUE_WATCHDOG_STATE:-$HOME/Library/Logs/mac-yolo/revenue-loop-watchdog.state}"
LOG="${REVENUE_WATCHDOG_LOG:-$HOME/Library/Logs/mac-yolo/revenue-loop-watchdog.jsonl}"
STALENESS_MULTIPLIER="${REVENUE_WATCHDOG_STALENESS_MULTIPLIER:-2}"
# Space-separated launchd labels to check (override only for tests).
JOBS="${REVENUE_WATCHDOG_JOBS:-com.igor.revenue-autonomous-loop com.igor.ralph-gsd-loop}"
now="${HERMES_NOW_EPOCH:-$(date +%s)}"

mkdir -p "$(dirname "$LOG")" 2>/dev/null || true

# check_job LABEL — prints one "|"-joined concern per line to stdout (empty output
# means the job is healthy). Never exits non-zero itself; callers aggregate.
check_job() {
  local label="$1"
  local plist="$LAUNCH_AGENTS_DIR/$label.plist"

  if [ ! -f "$plist" ]; then
    printf '%s|plist missing: %s\n' "$label" "$plist"
    return 0
  fi

  local working_dir start_interval stdout_path stderr_path
  working_dir="$("$PLISTBUDDY_BIN" -c 'Print :WorkingDirectory' "$plist" 2>/dev/null || true)"
  start_interval="$("$PLISTBUDDY_BIN" -c 'Print :StartInterval' "$plist" 2>/dev/null || true)"
  stdout_path="$("$PLISTBUDDY_BIN" -c 'Print :StandardOutPath' "$plist" 2>/dev/null || true)"
  stderr_path="$("$PLISTBUDDY_BIN" -c 'Print :StandardErrorPath' "$plist" 2>/dev/null || true)"

  # (a) WorkingDirectory must exist as a real directory. This is the exact failure
  # class from the incident: a deleted worktree leaves this pointing at nothing,
  # and launchd fails to spawn (exit 78) before the Node script ever runs.
  if [ -z "$working_dir" ]; then
    printf '%s|WorkingDirectory key missing from plist\n' "$label"
  elif [ ! -d "$working_dir" ]; then
    printf '%s|WorkingDirectory does not exist: %s\n' "$label" "$working_dir"
  fi

  # (b) launchd's own view of the last run. A job stuck in the exit-78 spawn-fail
  # loop reports this via `launchctl print`, independent of anything in the plist.
  local print_out last_exit
  print_out="$("$LAUNCHCTL_BIN" print "$GUI_DOMAIN/$label" 2>/dev/null || true)"
  if [ -z "$print_out" ]; then
    printf '%s|launchd job not loaded: %s\n' "$label" "$label"
  else
    last_exit="$(printf '%s\n' "$print_out" | awk -F'= ' '/last exit code/ {print $2; exit}' | tr -d '[:space:]')"
    if [ -z "$last_exit" ]; then
      printf '%s|last exit code unreadable from launchctl print\n' "$label"
    elif [ "$last_exit" != "0" ]; then
      printf '%s|last exit code %s\n' "$label" "$last_exit"
    fi
  fi

  # (c) stdout/stderr freshness vs 2x the job's own StartInterval. A job wedged in
  # the exit-78 loop never reaches the point where it writes to these logs, so
  # they go stale even though launchd keeps "trying" forever.
  case "$start_interval" in
    ''|*[!0-9]*)
      printf '%s|StartInterval unreadable from plist, cannot evaluate log freshness\n' "$label"
      ;;
    *)
      local threshold=$((start_interval * STALENESS_MULTIPLIER))
      local newest_mtime=0
      local f mtime
      for f in "$stdout_path" "$stderr_path"; do
        [ -n "$f" ] && [ -f "$f" ] || continue
        mtime="$("$STAT_BIN" -f %m "$f" 2>/dev/null || echo 0)"
        case "$mtime" in ''|*[!0-9]*) mtime=0 ;; esac
        [ "$mtime" -gt "$newest_mtime" ] && newest_mtime="$mtime"
      done
      if [ "$newest_mtime" = 0 ]; then
        printf '%s|no stdout/stderr log output found\n' "$label"
      else
        local age=$((now - newest_mtime))
        if [ "$age" -gt "$threshold" ]; then
          printf '%s|stale output: last write %ss ago > threshold %ss (2x StartInterval=%ss)\n' \
            "$label" "$age" "$threshold" "$start_interval"
        fi
      fi
      ;;
  esac
}

concerns=()
job_summaries=()
for job in $JOBS; do
  job_concerns=()
  while IFS= read -r line; do
    [ -n "$line" ] || continue
    concerns+=("$line")
    job_concerns+=("${line#*|}")
  done < <(check_job "$job")
  if [ "${#job_concerns[@]}" -eq 0 ]; then
    job_summaries+=("$job:ok")
  else
    job_summaries+=("$job:degraded(${#job_concerns[@]})")
  fi
done

ts="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
status=ok
[ "${#concerns[@]}" -gt 0 ] && status=degraded

# JSONL line: status, per-job summary, and the concern list (label|reason each).
concerns_json="$(printf '%s\n' "${concerns[@]+"${concerns[@]}"}" | \
  awk 'BEGIN{ORS=""} NF{gsub(/"/,"\\\"" ); printf "%s\"%s\"", (n++?",":""), $0}')"
printf '{"ts":"%s","status":"%s","jobs":"%s","concerns":[%s]}\n' \
  "$ts" "$status" "$(printf '%s ' "${job_summaries[@]+"${job_summaries[@]}"}" | sed 's/ $//')" \
  "$concerns_json" >> "$LOG"

echo "revenue-loop-watchdog $ts status=$status jobs=${job_summaries[*]+"${job_summaries[*]}"} concerns=${#concerns[@]}"
for c in "${concerns[@]+"${concerns[@]}"}"; do
  echo "  concern: $c"
done

prev="$(cat "$STATE" 2>/dev/null || echo unknown)"
printf '%s\n' "$status" > "$STATE"
if [ "$status" = degraded ] && [ "$prev" != degraded ]; then
  alert_body="$(printf 'Revenue loop watchdog DEGRADED (%s):\n' "$ts"; printf ' - %s\n' "${concerns[@]}")"
  "$CURL_BIN" -sS -m 10 -H "Title: Revenue loop watchdog degraded" -H "Priority: high" \
    -d "$alert_body" "$NTFY_URL" >/dev/null 2>&1 || true
elif [ "$status" = ok ] && [ "$prev" = degraded ]; then
  "$CURL_BIN" -sS -m 10 -H "Title: Revenue loop watchdog recovered" \
    -d "recovered at $ts" "$NTFY_URL" >/dev/null 2>&1 || true
fi

[ "$status" = ok ]
