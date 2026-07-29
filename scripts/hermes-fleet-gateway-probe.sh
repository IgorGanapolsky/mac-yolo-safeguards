#!/usr/bin/env bash
# Cross-machine Hermes :8642 probe. Runs on a healthy observer (usually MBP):
#   1) curl mini + MBP health
#   2) if mini is down, SSH and force-restore (clear expired/stuck circuit, load
#      launchd, start gateway, run local watchdog once)
#   3) edge-triggered ntfy on multi-tick outage / recovery
#
# Does NOT pair phones or steal USB. Local gateway heal is still owned by
# hermes-gateway-watchdog.sh on each host; this is the fleet safety net when
# that agent is itself stuck under a memory circuit.
set -uo pipefail

CURL_BIN="${HERMES_CURL_BIN:-curl}"
SSH_BIN="${HERMES_SSH_BIN:-ssh}"
LOG="${HERMES_FLEET_PROBE_LOG:-${HOME}/Library/Logs/hermes-fleet-gateway-probe.log}"
STATE="${HERMES_FLEET_PROBE_STATE:-${HOME}/Library/Logs/mac-yolo/hermes-fleet-gateway-probe.state}"
MINI_URL="${HERMES_MINI_HEALTH_URL:-http://100.94.135.78:8642/health}"
MBP_URL="${HERMES_MBP_HEALTH_URL:-http://100.87.85.85:8642/health}"
MINI_SSH="${HERMES_MINI_SSH:-igors-mac-mini.tail12aa33.ts.net}"
SSH_OPTS="${HERMES_FLEET_SSH_OPTS:--o ConnectTimeout=8 -o BatchMode=yes -o StrictHostKeyChecking=accept-new}"
ALERT_NTFY_TOPIC="${HERMES_FLEET_PROBE_NTFY_TOPIC:-yolo-guard-fdh8ktuw1vtxb5sb}"
ALERT_NTFY_URL="${HERMES_FLEET_PROBE_NTFY_URL:-https://ntfy.sh/$ALERT_NTFY_TOPIC}"
# When 1 (default), attempt SSH heal on mini. Set 0 for observe-only.
HEAL_MINI="${HERMES_FLEET_HEAL_MINI:-1}"
# Dry-run: no SSH, no ntfy (tests set this).
DRY_RUN="${HERMES_FLEET_PROBE_DRY_RUN:-0}"

mkdir -p "$(dirname "$LOG")" "$(dirname "$STATE")" 2>/dev/null || true

ts() { date '+%Y-%m-%dT%H:%M:%S%z'; }
logline() { printf '%s %s\n' "$(ts)" "$1" >> "$LOG" 2>/dev/null || true; }

http_code() {
  "$CURL_BIN" -sS --max-time 5 -o /dev/null -w '%{http_code}' "$1" 2>/dev/null || printf '000'
}

notify() {
  local title="$1" body="$2" priority="${3:-default}"
  if [ "$DRY_RUN" = "1" ]; then
    logline "DRY ntfy title=$title body=$body"
    return 0
  fi
  "$CURL_BIN" -sS -m 10 -H "Title: $title" -H "Priority: $priority" \
    -d "$body" "$ALERT_NTFY_URL" >/dev/null 2>&1 || true
}

# Remote restore script executed on the mini via SSH (or mocked).
# Clears expired circuit markers, loads KeepAlive gateway, runs watchdog once.
remote_restore_script() {
  cat <<'EOS'
set +e
# Fleet heal is intentional recovery: clear circuit even under memory pressure,
# then force a listener on :8642. Local watchdog may still skip pin/warmup under
# pressure, but must not leave the phone on "Cannot reach" for hours.
rm -f /tmp/yolo-hermes-gateway-circuit-open /tmp/yolo-memory-recovery-until
PLIST="$HOME/Library/LaunchAgents/ai.hermes.gateway.plist"
if [ -f "$PLIST" ]; then
  launchctl load -w "$PLIST" >/dev/null 2>&1 || true
  launchctl kickstart -k "gui/$(id -u)/ai.hermes.gateway" >/dev/null 2>&1 || true
fi
code=$(curl -sS -m 3 -o /dev/null -w "%{http_code}" http://127.0.0.1:8642/health 2>/dev/null || echo 000)
if [ "$code" != "200" ]; then
  # Prefer free :8642 listeners only (avoid pkill -f self-match classes).
  for pid in $(lsof -tiTCP:8642 -sTCP:LISTEN 2>/dev/null); do
    kill "$pid" 2>/dev/null || true
  done
  sleep 1
  nohup "$HOME/.hermes/hermes-agent/venv/bin/python" -m hermes_cli.main gateway run --replace \
    >>"$HOME/.hermes/logs/gateway.log" 2>>"$HOME/.hermes/logs/gateway.error.log" &
  i=0
  while [ "$i" -lt 12 ]; do
    code=$(curl -sS -m 3 -o /dev/null -w "%{http_code}" http://127.0.0.1:8642/health 2>/dev/null || echo 000)
    [ "$code" = "200" ] && break
    i=$((i + 1))
    sleep 2
  done
fi
# Local watchdog tick (pin/warmup only if pressure allows; will not stop a live listener
# unless a fresh circuit is open).
if [ -x "$HOME/.hermes/hermes-gateway-watchdog.sh" ]; then
  bash "$HOME/.hermes/hermes-gateway-watchdog.sh" >/dev/null 2>&1 || true
fi
code=$(curl -sS -m 3 -o /dev/null -w "%{http_code}" http://127.0.0.1:8642/health 2>/dev/null || echo 000)
printf 'remote_health=%s\n' "$code"
EOS
}

heal_mini() {
  if [ "$HEAL_MINI" != "1" ]; then
    logline "mini down but HERMES_FLEET_HEAL_MINI=0 -> skip SSH heal"
    return 1
  fi
  if [ "$DRY_RUN" = "1" ]; then
    logline "DRY heal mini via SSH"
    # Tests inject HERMES_FLEET_HEAL_CMD to simulate remote output.
    if [ -n "${HERMES_FLEET_HEAL_CMD:-}" ]; then
      # shellcheck disable=SC2086
      eval "$HERMES_FLEET_HEAL_CMD"
      return $?
    fi
    return 0
  fi
  logline "SSH heal mini ($MINI_SSH)"
  # shellcheck disable=SC2086
  remote_restore_script | "$SSH_BIN" $SSH_OPTS "$MINI_SSH" 'bash -s' 2>>"$LOG" || true
}

mini_code="$(http_code "$MINI_URL")"
mbp_code="$(http_code "$MBP_URL")"
logline "probe mini=$mini_code mbp=$mbp_code"

prev="$(cat "$STATE" 2>/dev/null || echo ok)"
healed=0

if [ "$mini_code" != "200" ]; then
  heal_mini && healed=1
  # Re-probe after heal
  mini_code="$(http_code "$MINI_URL")"
  logline "post-heal mini=$mini_code"
fi

# Edge-triggered fleet alert: healing on first fail, degraded+ntfy on second.
if [ "$mini_code" = "200" ]; then
  if [ "$prev" = "degraded" ] || [ "$prev" = "healing" ]; then
    notify "Hermes fleet: mini gateway recovered" \
      "mini $MINI_URL healthy (mbp=$mbp_code) at $(ts) healed=$healed" default
  fi
  printf 'ok' > "$STATE" 2>/dev/null || true
  if [ "$mbp_code" != "200" ]; then
    logline "warn: MBP gateway unhealthy http=$mbp_code (mini ok)"
  fi
  exit 0
fi

# mini still down
case "$prev" in
  healing)
    notify "Hermes fleet: mini gateway down" \
      "mini $MINI_URL still http=$mini_code after heal attempt (mbp=$mbp_code) at $(ts)" high
    printf 'degraded' > "$STATE" 2>/dev/null || true
    exit 1
    ;;
  degraded)
    logline "mini still degraded http=$mini_code (silent)"
    exit 1
    ;;
  *)
    printf 'healing' > "$STATE" 2>/dev/null || true
    logline "mini unhealthy http=$mini_code -> healing"
    exit 1
    ;;
esac
