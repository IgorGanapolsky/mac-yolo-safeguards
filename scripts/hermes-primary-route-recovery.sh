#!/usr/bin/env bash
# hermes-primary-route-recovery - bring the gateway's PRIMARY model route back after an
# upstream quota window closes, instead of sitting on a fallback model for days.
#
# The failure this exists for (observed 2026-07-27):
#   z.ai returned `429 code 1310 "Weekly/Monthly Limit Exhausted. Your limit will reset
#   at 2026-08-01 21:07:02"`. LiteLLM cooled the deployment down and every request for
#   `glm-coding` silently began answering as `nvidia/nemotron-3-ultra-550b-a55b:free`.
#   Nothing surfaced it; agents just got quietly worse. LiteLLM's cooldown is in-memory,
#   so a proxy restart clears it — but only if somebody notices and restarts.
#
# Rather than hardcode a reset date (brittle) this reads the reset timestamp the proxy
# itself logged, and only restarts once that moment has actually passed. Before then it
# does nothing, so it never thrashes a proxy whose upstream is still legitimately out.
#
#   hermes-primary-route-recovery.sh            check, and restart if warranted
#   hermes-primary-route-recovery.sh --dry-run  report the decision, change nothing
#
# Exit: 0 no action needed / 0 acted / 1 could not determine (never fails the caller).
set -euo pipefail

GATEWAY="${HERMES_GATEWAY_URL:-http://127.0.0.1:4010/v1}"
PRIMARY="${HERMES_PRIMARY_MODEL:-glm-coding}"
API_KEY="${HERMES_GATEWAY_KEY:-hermes-local-gateway}"
ERRLOG="${HERMES_LITELLM_ERRLOG:-$HOME/.hermes/litellm-logs/proxy.err.log}"
SERVICE="${HERMES_LITELLM_SERVICE:-com.igor.hermes-litellm}"
STATE="${HERMES_ROUTE_RECOVERY_STATE:-$HOME/.hermes/route-recovery-last}"
LOG="${HERMES_ROUTE_RECOVERY_LOG:-$HOME/Library/Logs/hermes-primary-route-recovery.log}"
COOLDOWN="${HERMES_ROUTE_RECOVERY_COOLDOWN:-21600}"   # 6h between restart attempts
DRY_RUN="${1:-}"

mkdir -p "$(dirname "$LOG")" 2>/dev/null || true
log() { printf '%s %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$1" | tee -a "$LOG" >&2; }

# Which model does the gateway actually answer with? (1 token; the ID being listed in
# /v1/models proves nothing — the fallback chain still answers as something else.)
# Retried: the fallback rungs are free tiers that intermittently rate-limit, so a single
# miss is not evidence of anything. Two misses in a row is treated as "cannot determine",
# which makes this script do nothing rather than restart on noise.
serving_model() {
  local attempt out
  for attempt in 1 2 3; do
    out="$(curl -fsS -m 30 "${GATEWAY%/}/chat/completions" \
      -H "Authorization: Bearer $API_KEY" -H "Content-Type: application/json" \
      -d "{\"model\":\"$PRIMARY\",\"messages\":[{\"role\":\"user\",\"content\":\"hi\"}],\"max_tokens\":1}" \
      2>/dev/null | sed -n 's/.*"model"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' | head -n1)"
    [[ -n "$out" ]] && { printf '%s\n' "$out"; return 0; }
    (( attempt < 3 )) && sleep 3
  done
  return 1
}

# Most recent "Your limit will reset at YYYY-MM-DD HH:MM:SS" the proxy logged, as epoch.
# Empty when the upstream never told us — in which case we do NOT guess a window.
reset_epoch() {
  [[ -r "$ERRLOG" ]] || return 1
  local stamp
  stamp="$(grep -ao 'reset at [0-9-]\{10\} [0-9:]\{8\}' "$ERRLOG" 2>/dev/null | tail -n1 | sed 's/^reset at //')"
  [[ -n "$stamp" ]] || return 1
  date -j -f '%Y-%m-%d %H:%M:%S' "$stamp" '+%s' 2>/dev/null
}

serving="$(serving_model || true)"
if [[ -z "$serving" ]]; then
  log "UNKNOWN: gateway did not answer for $PRIMARY (down, or no capacity) — no action"
  exit 1
fi

if [[ "$serving" == "$PRIMARY" ]]; then
  log "OK: $PRIMARY is serving itself — nothing to recover"
  exit 0
fi

if ! reset_at="$(reset_epoch)"; then
  log "FELL BACK: $PRIMARY -> $serving, but no upstream reset time logged — not guessing; no action"
  exit 0
fi

now="$(date '+%s')"
if (( now < reset_at )); then
  log "FELL BACK: $PRIMARY -> $serving; upstream quota resets $(date -r "$reset_at" '+%Y-%m-%d %H:%M:%S') — waiting"
  exit 0
fi

last="$(cat "$STATE" 2>/dev/null || echo 0)"
[[ "$last" =~ ^[0-9]+$ ]] || last=0
if (( now - last < COOLDOWN )); then
  log "FELL BACK: $PRIMARY -> $serving; reset has passed but last restart was $(( (now - last) / 60 ))m ago — cooling down"
  exit 0
fi

if [[ "$DRY_RUN" == "--dry-run" ]]; then
  log "DRY-RUN: would restart $SERVICE to clear the stale cooldown ($PRIMARY -> $serving)"
  exit 0
fi

log "ACTING: reset passed and $PRIMARY still answers as $serving — restarting $SERVICE to clear LiteLLM's cooldown"
if launchctl kickstart -k "gui/$(id -u)/$SERVICE" >/dev/null 2>&1; then
  printf '%s\n' "$now" > "$STATE"
  sleep 12
  after="$(serving_model || true)"
  if [[ "$after" == "$PRIMARY" ]]; then
    log "RECOVERED: $PRIMARY is serving itself again"
  else
    log "STILL FALLING BACK after restart: $PRIMARY -> ${after:-unknown} (upstream likely still out)"
  fi
else
  log "ERROR: could not kickstart $SERVICE"
  exit 1
fi
