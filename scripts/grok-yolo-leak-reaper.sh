#!/usr/bin/env bash
# grok-yolo-leak-reaper.sh - reap abandoned grok / grok-yolo processes that run for
# HOURS holding the local Ollama model resident (the recurring 24GB-box memory thrash:
# a stale `grok-0.2… --model ollama-hermes-zero-spend` seen at 15-21h age, ~7GB pinned).
#
# Kills only grok processes OLDER than the threshold — a real coding session doesn't
# idle for hours, so age is a safe "abandoned" signal. Fresh runs are never touched.
#
#   grok-yolo-leak-reaper.sh            # report only (dry run)
#   grok-yolo-leak-reaper.sh --apply    # kill stale grok leaks
# Env: GROK_REAP_MAX_HOURS (default 4), GROK_REAP_PATTERN (default matches grok bins).
set -euo pipefail

MAX_HOURS="${GROK_REAP_MAX_HOURS:-4}"
PATTERN="${GROK_REAP_PATTERN:-grok-0\.[0-9]|/\.grok/|grok-yolo}"
LOG="${GROK_REAP_LOG:-$HOME/Library/Logs/grok-yolo-leak-reaper.log}"
APPLY=0
for a in "$@"; do case "$a" in --apply) APPLY=1;; esac; done

# etime -> seconds. macOS ps format: [[DD-]HH:]MM:SS. Pure parameter expansion.
etime_to_secs() {
  local e="$1" dd=0 hh=0 mm=0 ss=0 rest tmp colons
  rest="$e"
  if [[ "$e" == *-* ]]; then dd="${e%%-*}"; rest="${e#*-}"; fi
  colons="${rest//[^:]/}"
  case "${#colons}" in
    2) hh="${rest%%:*}"; tmp="${rest#*:}"; mm="${tmp%%:*}"; ss="${tmp##*:}" ;;
    1) mm="${rest%%:*}"; ss="${rest##*:}" ;;
    0) ss="$rest" ;;
  esac
  echo $(( 10#${dd:-0} * 86400 + 10#${hh:-0} * 3600 + 10#${mm:-0} * 60 + 10#${ss:-0} ))
}

max_secs=$(( MAX_HOURS * 3600 ))
reaped=0; seen=0
# read splits: pid, etime, then REST -> cmd (handles spaces in the command). -axww =
# full argv, untruncated.
while read -r pid etime cmd; do
  [ -n "${pid:-}" ] || continue
  case "$pid" in *[!0-9]*) continue;; esac   # skip a stray header/blank line
  echo "$cmd" | grep -qE "$PATTERN" || continue
  # Never reap this reaper or the ps/grep pipeline itself.
  echo "$cmd" | grep -qE "grok-yolo-leak-reaper" && continue
  seen=$((seen+1))
  secs=$(etime_to_secs "$etime")
  age_h=$(( secs / 3600 ))
  if [ "$secs" -ge "$max_secs" ]; then
    if [ "$APPLY" = 1 ]; then
      if kill "$pid" 2>/dev/null; then
        echo "$(date) REAPED pid=$pid age=${age_h}h cmd=$(echo "$cmd" | cut -c1-80)" >> "$LOG"
        echo "REAPED pid=$pid age=${age_h}h"
        reaped=$((reaped+1))
      fi
    else
      echo "STALE  pid=$pid age=${age_h}h cmd=$(echo "$cmd" | cut -c1-80)"
    fi
  else
    echo "fresh  pid=$pid age=${age_h}h (<${MAX_HOURS}h, kept)"
  fi
done < <(ps -ax -o pid=,etime=,command= 2>/dev/null)

echo "grok-reaper: grok procs seen=$seen reaped=$reaped threshold=${MAX_HOURS}h apply=$APPLY"
[ "$APPLY" = 1 ] || echo "dry run — re-run with --apply"
