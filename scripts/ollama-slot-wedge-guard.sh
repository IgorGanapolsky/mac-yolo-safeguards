#!/bin/sh
# Detect and clear a deadlocked Ollama runner slot.
#
# Ollama runs with OLLAMA_NUM_PARALLEL=1 (com.igor.ollama-env) because KV-cache
# RAM scales as num_parallel * context. That single slot is also a single point
# of failure: if one request wedges mid-prompt-processing, llama.cpp keeps the
# slot marked is_processing=true forever and every later request queues behind
# it FIFO. The user-visible symptom is "grok-yolo / poolside-yolo is stuck" --
# the agent CLI is fine, it is starved.
#
# Observed 2026-07-28 (poolside-yolo) and 2026-07-30 (grok-yolo): slot 0 held
# a 26,628-token prompt with is_processing=true while llama-server burned 0.1%
# CPU. Recovery is to kill the runner child; ollama serve respawns it.
#
# Discriminator: a runner legitimately chewing a large prompt shows
# is_processing=true with HIGH cpu. Only ~0% cpu across two samples is a wedge.
set -u

OLLAMA_URL="${WEDGE_GUARD_OLLAMA_URL:-http://127.0.0.1:11434}"
PROBE_TIMEOUT="${WEDGE_GUARD_PROBE_TIMEOUT:-20}"
CPU_IDLE_MAX="${WEDGE_GUARD_CPU_IDLE_MAX:-2.0}"
SAMPLE_GAP="${WEDGE_GUARD_SAMPLE_GAP:-4}"

log() { echo "$(date -u +"%Y-%m-%dT%H:%M:%SZ") $*"; }

# 1. Cheap liveness probe. A healthy front door answers /api/ps immediately.
if ! curl -fs --max-time "$PROBE_TIMEOUT" "$OLLAMA_URL/api/ps" >/dev/null 2>&1; then
  log "ollama front door unresponsive after ${PROBE_TIMEOUT}s"
else
  # Front door answers. Confirm a real generation path is not wedged by
  # checking whether any runner claims to be processing while idling at ~0% cpu.
  :
fi

# 2. Enumerate runner children and their listen ports.
ps -axo pid=,pcpu=,command= 2>/dev/null \
  | grep '[l]lama-server' \
  | while read -r pid cpu1 rest; do
      port=$(echo "$rest" | sed -n 's/.*--port \([0-9]*\).*/\1/p')
      [ -n "$port" ] || continue

      slots=$(curl -fs --max-time 5 "http://127.0.0.1:${port}/slots" 2>/dev/null) || continue
      echo "$slots" | grep -q '"is_processing":true' || continue

      # Second CPU sample: busy runners climb, wedged ones stay flat.
      # Require two samples AND no movement between them to avoid killing legitimate inference.
      sleep "$SAMPLE_GAP"
      cpu2=$(ps -o pcpu= -p "$pid" 2>/dev/null | tr -d ' ')
      [ -n "$cpu2" ] || continue

      idle=$(awk -v a="$cpu1" -v b="$cpu2" -v m="$CPU_IDLE_MAX" \
               'BEGIN { print (a < m && b < m) ? 1 : 0 }')
      [ "$idle" = "1" ] || continue
      moved=$(awk -v a="$cpu1" -v b="$cpu2" 'BEGIN { print (a != b) ? 1 : 0 }')
      [ "$moved" = "1" ] || continue

      # Third sample: confirm the runner is still stuck at low CPU after another gap.
      sleep "$SAMPLE_GAP"
      cpu3=$(ps -o pcpu= -p "$pid" 2>/dev/null | tr -d ' ')
      [ -n "$cpu3" ] || continue
      still_idle=$(awk -v b="$cpu2" -v c="$cpu3" -v m="$CPU_IDLE_MAX" \
                     'BEGIN { print (b < m && c < m) ? 1 : 0 }')
      [ "$still_idle" = "1" ] || continue

      ntok=$(echo "$slots" | sed -n 's/.*"n_prompt_tokens":\([0-9]*\).*/\1/p' | head -1)
      log "WEDGE: llama-server pid=$pid port=$port is_processing=true cpu=${cpu1}/${cpu2}/${cpu3}% prompt_tokens=${ntok:-?} -- killing runner"
      kill -9 "$pid" 2>/dev/null

      sleep 3
      if curl -fs --max-time 15 "$OLLAMA_URL/api/ps" >/dev/null 2>&1; then
        log "recovered: ollama responsive after runner kill"
      else
        log "WARN: ollama still unresponsive after killing pid=$pid"
      fi
    done

exit 0
