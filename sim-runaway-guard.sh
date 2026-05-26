#!/bin/sh
# Runs every 60s. Kills booted simulators if either:
#   A. Load avg (1-min) > 30 AND >50 simruntime processes  → CPU runaway
#   B. Total simruntime memory > 50% AND >50 simruntime processes  → idle memory hog
# A healthy single sim (low sim_count or modest memory) is left alone.

LOG=/tmp/shutdown-simulators.log

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

if [ -n "$REASON" ]; then
  echo "$(date) RUNAWAY: $REASON — shutting down simulators" >> "$LOG"
  /usr/bin/xcrun simctl shutdown all >> "$LOG" 2>&1
  /usr/bin/killall -9 Simulator >> "$LOG" 2>&1
  echo "$(date) shutdown complete" >> "$LOG"
fi

exit 0
