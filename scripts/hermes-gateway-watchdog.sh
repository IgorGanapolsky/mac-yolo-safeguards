#!/bin/bash
# Hermes gateway watchdog — keeps the gateway healthy without fighting the memory
# pressure guardian. Model pinning and pre-warming are explicit opt-ins.
#
# Runs every 60s via com.igor.hermes-gateway-watchdog.plist (RunAtLoad + StartInterval).
# Three responsibilities, each idempotent so repeated ticks are safe:
#   1. Restart the gateway ONLY when the process is truly gone (never double-start,
#      which would trigger the Telegram/session conflicts other agents guarded against).
#   2. Optionally keep the model resident for a bounded duration. Never pin while
#      the kernel reports pressure or the guardian's recovery cooldown is active.
#   3. Optionally pre-warm once per gateway restart, with the same pressure gate.
#
# Every external command and path is env-overridable so the branching logic is unit
# testable without a live gateway (see tests/test-hermes-gateway-watchdog.sh).
set -uo pipefail

HEALTH_URL="${HERMES_HEALTH_URL:-http://127.0.0.1:8642/health}"
CHAT_URL="${HERMES_CHAT_URL:-http://127.0.0.1:8642/v1/chat/completions}"
OLLAMA_URL="${HERMES_OLLAMA_URL:-http://127.0.0.1:11434}"
ENV_FILE="${HERMES_ENV_FILE:-/Users/igorganapolsky/.hermes/.env}"
if [ -z "${HERMES_MODEL:-}" ] && [ -f "$ENV_FILE" ]; then
  env_model="$(grep -E "^HERMES_MODEL=" "$ENV_FILE" 2>/dev/null | cut -d= -f2- | tr -d '"' | tr -d "'" | head -1)"
  if [ -n "$env_model" ]; then
    HERMES_MODEL="$env_model"
  fi
fi
MODEL="${HERMES_MODEL:-qwen3:8b-64k}"
PYBIN="${HERMES_PYBIN:-/Users/igorganapolsky/.hermes/hermes-agent/venv/bin/python}"
AGENT_LOG="${HERMES_AGENT_LOG:-/Users/igorganapolsky/.hermes/logs/agent.log}"
LOG="${HERMES_WATCHDOG_LOG:-/Users/igorganapolsky/.hermes/logs/gateway-watchdog.log}"
STATE="${HERMES_WATCHDOG_STATE:-/Users/igorganapolsky/.hermes/.watchdog-warmed-pid}"
GATEWAY_MATCH="${HERMES_GATEWAY_MATCH:-hermes_cli.main gateway run}"
WARMUP_COUNT="${HERMES_WARMUP_COUNT:-0}"
CURL_BIN="${HERMES_CURL_BIN:-curl}"
PGREP_BIN="${HERMES_PGREP_BIN:-pgrep}"
SYSCTL_BIN="${HERMES_SYSCTL_BIN:-sysctl}"
RECOVERY_FILE="${YOLO_MEMORY_RECOVERY_FILE:-/tmp/yolo-memory-recovery-until}"
PIN_MODEL="${HERMES_PIN_MODEL:-0}"
PIN_KEEP_ALIVE="${HERMES_PIN_KEEP_ALIVE:-2m}"
# Vault presence file the gateway ages to derive the mobile "active/idle/away" badge
# (gateway reads its mtime: <15m=active, <6h=idle, else away). Nothing else refreshes
# it, so it drifts to "away" even while the gateway is serving. Touch it every healthy
# tick so the badge tracks real gateway liveness. Set HERMES_PRESENCE_FILE="" to skip.
PRESENCE_FILE="${HERMES_PRESENCE_FILE:-/Users/igorganapolsky/Documents/AI-Agent-Sync/Agent-State/Hermes.md}"
TOUCH_BIN="${HERMES_TOUCH_BIN:-touch}"

ts()  { date "+%Y-%m-%dT%H:%M:%S%z"; }
logline() { printf '%s %s\n' "$(ts)" "$1" >> "$LOG" 2>/dev/null || true; }

gateway_health() {
  "$CURL_BIN" -s -m5 -o /dev/null -w "%{http_code}" "$HEALTH_URL" 2>/dev/null || echo 000
}
gateway_pid() {
  "$PGREP_BIN" -f "$GATEWAY_MATCH" 2>/dev/null | head -1
}

now="${HERMES_NOW_EPOCH:-$(date +%s)}"
pressure="${HERMES_MEMORY_PRESSURE_LEVEL:-$("$SYSCTL_BIN" -n kern.memorystatus_vm_pressure_level 2>/dev/null || echo 1)}"
recovery_until="$(cat "$RECOVERY_FILE" 2>/dev/null || echo 0)"
case "$pressure" in ''|*[!0-9]*) pressure=1 ;; esac
case "$recovery_until" in ''|*[!0-9]*) recovery_until=0 ;; esac
memory_block=0
if [ "$pressure" -ge 2 ] || [ "$now" -lt "$recovery_until" ]; then
  memory_block=1
  logline "memory recovery active (pressure=$pressure cooldown_until=$recovery_until) -> skip pin/warmup"
fi

# 1) Restart the gateway only if it is truly gone and memory recovery is not
# active. The guardian may deliberately boot out this supervisor when an active
# inference client defeats Ollama unload; restarting it during the shared
# cooldown would reopen the exact reload loop the circuit is meant to break.
code="$(gateway_health)"
if [ "$code" != "200" ]; then
  if [ "$memory_block" = "1" ]; then
    logline "gateway down (health=$code) during memory recovery -> leave stopped"
  elif [ -z "$(gateway_pid)" ]; then
    logline "gateway down (health=$code, no proc) -> starting"
    nohup "$PYBIN" -m hermes_cli.main gateway run >> "$AGENT_LOG" 2>&1 &
  else
    logline "gateway health=$code but proc alive (booting) -- no action"
  fi
fi

# 2) Optional bounded model residency. Default is on-demand loading.
# grep -c always prints a count (0 when absent) and exits 1 on no-match; `|| true`
# swallows that exit without appending a second "0" that would corrupt the compare.
if [ "$PIN_MODEL" != "0" ] && [ "$memory_block" = "0" ]; then
  resident="$("$CURL_BIN" -s -m5 "$OLLAMA_URL/api/ps" 2>/dev/null | grep -c "$MODEL" || true)"
  if [ "${resident:-0}" = "0" ]; then
    logline "model $MODEL not resident -> bounded pin (keep_alive=$PIN_KEEP_ALIVE)"
    "$CURL_BIN" -s -m120 "$OLLAMA_URL/api/generate" \
      -d "{\"model\":\"$MODEL\",\"prompt\":\"ok\",\"stream\":false,\"keep_alive\":\"$PIN_KEEP_ALIVE\",\"options\":{\"num_predict\":2}}" \
      >/dev/null 2>&1
  fi
fi

# 4) Refresh the vault presence file while healthy so the mobile badge reads "active"
# from real gateway liveness rather than a file that drifts stale (the "Hermes away"
# bug). Only bump mtime on a live gateway; a down gateway must be allowed to age out.
if [ -n "$PRESENCE_FILE" ] && [ "$(gateway_health)" = "200" ] && [ -f "$PRESENCE_FILE" ]; then
  "$TOUCH_BIN" "$PRESENCE_FILE" 2>/dev/null || true
fi

# 3) Optional pre-warm once per gateway (re)start. Disabled by default.
if [ "$WARMUP_COUNT" -gt 0 ] && [ "$memory_block" = "0" ] && [ "$(gateway_health)" = "200" ]; then
  pid="$(gateway_pid)"
  warmed="$(cat "$STATE" 2>/dev/null || echo "")"
  if [ -n "$pid" ] && [ "$pid" != "$warmed" ]; then
    key="$(grep -E "^API_SERVER_KEY=" "$ENV_FILE" 2>/dev/null | cut -d= -f2- | tr -d '"' | head -1)"
    if [ -n "$key" ]; then
      logline "pre-warming gateway pid=$pid (was ${warmed:-none})"
      i=0
      while [ "$i" -lt "$WARMUP_COUNT" ]; do
        "$CURL_BIN" -s -m180 "$CHAT_URL" \
          -H "Authorization: Bearer $key" -H "Content-Type: application/json" \
          -d "{\"model\":\"$MODEL\",\"messages\":[{\"role\":\"user\",\"content\":\"/no_think warmup\"}],\"max_tokens\":8,\"stream\":false}" \
          >/dev/null 2>&1
        i=$((i + 1))
      done
      printf '%s' "$pid" > "$STATE"
      logline "warmup complete for pid=$pid"
    fi
  fi
fi
