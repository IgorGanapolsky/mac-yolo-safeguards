#!/bin/sh
# Smart simulator runaway guard — runs every 60s via LaunchAgent.
#
# Behavior:
#   1. Kills runaway sims if load>30 AND >50 simruntime procs (CPU runaway)
#      OR sim_mem>50% AND >50 simruntime procs (memory hog).
#   2. Posts a macOS notification on every fire so the user knows.
#   3. ESCALATION: if it fires 3+ times in 10 minutes, also quits the
#      likely culprit app (Antigravity IDE) so the loop is broken.
#   4. Self-heals via `install.sh` if any safeguard file is missing.

REPO=/Users/igorganapolsky/workspace/git/igor/mac-yolo-safeguards

ESCALATE_AFTER_FIRES=${YOLO_ESCALATE_AFTER_FIRES:-3}
ESCALATE_WINDOW_SEC=${YOLO_ESCALATE_WINDOW_SEC:-600}
# Apps to quit on escalation — only quit if they're running. Override via env for tests.
SUSPECT_APPS=${YOLO_SUSPECT_APPS:-"Antigravity IDE|Antigravity"}
FIRES_LOG=${YOLO_FIRES_LOG:-/tmp/yolo-fires.log}
LOG=${YOLO_LOG:-/tmp/shutdown-simulators.log}

now=$(date +%s)

notify() {
  # macOS notification + log line. Works from LaunchAgent in gui/$(id -u).
  local TITLE="$1"; local MSG="$2"
  /usr/bin/osascript -e "display notification \"$MSG\" with title \"$TITLE\"" 2>/dev/null || true
  echo "$(date) NOTIFY: $TITLE — $MSG" >> "$LOG"
}

# --- Self-heal: if any expected symlink is missing, re-run install.sh ---
heal_needed=0
[ -L /Users/igorganapolsky/.local/bin/yolo-health ] || heal_needed=1
[ -L /Users/igorganapolsky/Library/LaunchAgents/com.igor.shutdown-simulators.plist ] || heal_needed=1
[ -L /Users/igorganapolsky/workspace/git/igor/antigravity-hub/antigravity-cli/bin/agy-yolo-wrapper.js ] || heal_needed=1
if [ "$heal_needed" = "1" ] && [ -x "$REPO/install.sh" ]; then
  echo "$(date) SELF-HEAL: re-running install.sh" >> "$LOG"
  /bin/sh "$REPO/install.sh" >> "$LOG" 2>&1 || true
fi

# --- Threshold check ---
LOAD=$(/usr/bin/uptime | /usr/bin/awk -F'load averages?:' '{print $2}' | /usr/bin/awk '{print $1}' | /usr/bin/tr -d ',')
LOAD_INT=${LOAD%.*}
[ -z "$LOAD_INT" ] && LOAD_INT=0

SIM_COUNT=$(/bin/ps ax | /usr/bin/grep -i simruntime | /usr/bin/grep -v grep | /usr/bin/wc -l | /usr/bin/tr -d ' ')
SIM_MEM=$(/bin/ps aux | /usr/bin/grep -i simruntime | /usr/bin/grep -v grep | /usr/bin/awk '{mem+=$4} END {printf "%d", mem+0}')
[ -z "$SIM_MEM" ] && SIM_MEM=0

REASON=""
if [ "$SIM_COUNT" -gt 50 ]; then
  if [ "$LOAD_INT" -gt 30 ]; then
    REASON="CPU runaway (load=$LOAD sim_procs=$SIM_COUNT)"
  elif [ "$SIM_MEM" -gt 50 ]; then
    REASON="memory hog (sim_mem=${SIM_MEM}% sim_procs=$SIM_COUNT)"
  fi
fi

[ -z "$REASON" ] && exit 0

# --- Fire: shut down sims ---
echo "$(date) RUNAWAY: $REASON — shutting down simulators" >> "$LOG"
/usr/bin/xcrun simctl shutdown all >> "$LOG" 2>&1
/usr/bin/killall -9 Simulator >> "$LOG" 2>&1
echo "$(date) shutdown complete" >> "$LOG"

echo "$now $REASON" >> "$FIRES_LOG"

# --- Escalation: count fires within window, quit suspect apps if N+ ---
cutoff=$((now - ESCALATE_WINDOW_SEC))
recent_fires=$(/usr/bin/awk -v c=$cutoff '$1 >= c' "$FIRES_LOG" 2>/dev/null | /usr/bin/wc -l | /usr/bin/tr -d ' ')

# Trim old entries to bound file size.
/usr/bin/awk -v c=$cutoff '$1 >= c' "$FIRES_LOG" > "${FIRES_LOG}.tmp" 2>/dev/null && /bin/mv "${FIRES_LOG}.tmp" "$FIRES_LOG"

if [ "$recent_fires" -ge "$ESCALATE_AFTER_FIRES" ]; then
  echo "$(date) ESCALATE: $recent_fires fires in last ${ESCALATE_WINDOW_SEC}s — checking suspect apps" >> "$LOG"
  quit_any=0
  for app in $(echo "$SUSPECT_APPS" | /usr/bin/tr '|' '\n'); do
    if /usr/bin/pgrep -fl "$app" >/dev/null 2>&1; then
      echo "$(date) ESCALATE: quitting '$app' (graceful, then SIGKILL)" >> "$LOG"
      /usr/bin/osascript -e "tell application \"$app\" to quit" 2>/dev/null
      /bin/sleep 5
      /usr/bin/pkill -9 -f "$app" 2>/dev/null
      quit_any=1
    fi
  done
  if [ "$quit_any" = "1" ]; then
    notify "yolo-guard escalated" "Quit suspect app(s) after $recent_fires sim-runaways in 10 min"
    : > "$FIRES_LOG"   # reset window so we don't immediately escalate again
  else
    notify "yolo-guard fired" "$REASON (no known suspect app running to escalate against)"
  fi
else
  notify "yolo-guard fired" "$REASON"
fi

exit 0
