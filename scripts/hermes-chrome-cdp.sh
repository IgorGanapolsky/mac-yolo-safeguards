#!/usr/bin/env bash
# Start / heal Hermes Chrome with remote debugging on port 9222.
# Never disables the browser toolset — heal CDP instead (NO-CONSTRAINTS policy).
#
# Failure mode this heals (2026-07-20): a non-CDP process can squat 127.0.0.1:9222
# while Chrome only binds [::1]:9222. Health checks and hermes-agent then talk to
# the squat over IPv4 and hang/fail even though DevTools is alive on IPv6.
set -euo pipefail

# Optional persistent mode from install-browser-bridge.sh (daily vs dedicated).
STATE_FILE="${HERMES_BROWSER_BRIDGE_STATE:-${HOME}/.hermes/browser-bridge.env}"
if [[ -f "$STATE_FILE" ]]; then
  # shellcheck disable=SC1090
  set -a
  # shellcheck disable=SC1090
  source "$STATE_FILE"
  set +a
fi

PORT="${HERMES_CDP_PORT:-9222}"
PROFILE="${HERMES_CDP_PROFILE:-${HOME}/.hermes/chrome-cdp-profile}"
LOG="${HERMES_CDP_LOG:-${HOME}/Library/Logs/hermes-chrome-cdp.log}"
CHROME_BIN="${HERMES_CHROME_BIN:-/Applications/Google Chrome.app/Contents/MacOS/Google Chrome}"
BIND_ADDR="${HERMES_CDP_BIND:-127.0.0.1}"
RECLAIM="${HERMES_CDP_RECLAIM_SQUAT:-1}"

mkdir -p "$(dirname "$LOG")"
# Daily Chrome profile already exists; dedicated profile may need create.
mkdir -p "$PROFILE" 2>/dev/null || true

# Return CDP /json/version body when the endpoint is a real Chrome DevTools server.
cdp_version_body() {
  local host="$1"
  local url body
  if [[ "$host" == *:* ]]; then
    url="http://[${host}]:${PORT}/json/version"
    body="$(curl -sgf --max-time 2 "$url" 2>/dev/null || true)"
  else
    url="http://${host}:${PORT}/json/version"
    body="$(curl -sf --max-time 2 "$url" 2>/dev/null || true)"
  fi
  if [[ -n "$body" ]] && grep -q 'webSocketDebuggerUrl' <<<"$body"; then
    printf '%s' "$body"
    return 0
  fi
  return 1
}

# True when a real CDP endpoint answers on IPv4 or IPv6 loopback.
cdp_ok() {
  cdp_version_body 127.0.0.1 >/dev/null 2>&1 && return 0
  cdp_version_body ::1 >/dev/null 2>&1 && return 0
  return 1
}

# True only when IPv4 CDP works — required for hermes-agent browser.cdp_url defaults.
cdp_ok_ipv4() {
  cdp_version_body 127.0.0.1 >/dev/null 2>&1
}

# Kill PIDs listening on PORT that are NOT a real CDP server and NOT the user's
# daily Chrome. Safe reclaim targets: sleep-socket squats, stale proxies, dead
# forwarders. Never touches Chrome unless it is the hermes chrome-cdp-profile.
reclaim_non_cdp_squat() {
  [[ "$RECLAIM" == "1" ]] || return 0
  if cdp_ok_ipv4; then
    return 0
  fi

  local pids pid cmd
  pids="$(lsof -nP -iTCP:"${PORT}" -sTCP:LISTEN -t 2>/dev/null || true)"
  [[ -n "$pids" ]] || return 0

  for pid in $pids; do
    [[ "$pid" =~ ^[0-9]+$ ]] || continue
    cmd="$(ps -p "$pid" -o command= 2>/dev/null || true)"
    [[ -n "$cmd" ]] || continue

    # Leave a healthy hermes CDP Chrome alone (IPv6-only case handled below by restart).
    if grep -q "chrome-cdp-profile" <<<"$cmd" && grep -q "remote-debugging-port=${PORT}" <<<"$cmd"; then
      continue
    fi
    # Never kill the user's interactive Chrome profile.
    if grep -Eqi 'Google Chrome|Chromium' <<<"$cmd" && ! grep -q "chrome-cdp-profile" <<<"$cmd"; then
      echo "CDP squat reclaim skipped pid=${pid} (non-Hermes Chrome)" >>"$LOG"
      continue
    fi

    echo "CDP squat reclaim: killing non-CDP listener pid=${pid} on :${PORT}" | tee -a "$LOG"
    kill "$pid" 2>/dev/null || true
    sleep 0.2
    kill -9 "$pid" 2>/dev/null || true
  done
}

if cdp_ok_ipv4; then
  echo "CDP already healthy on 127.0.0.1:${PORT}"
  exit 0
fi

if [[ ! -x "$CHROME_BIN" ]]; then
  echo "Chrome binary missing: $CHROME_BIN" >&2
  exit 1
fi

reclaim_non_cdp_squat

# Kill only a prior hermes CDP profile instance on this port (not the user's daily Chrome).
# Wait until gone — otherwise a new launch prints "Opening in existing browser session"
# and inherits the broken IPv6-only DevTools bind.
if pgrep -f "chrome-cdp-profile.*remote-debugging-port=${PORT}" >/dev/null 2>&1; then
  pkill -f "chrome-cdp-profile.*remote-debugging-port=${PORT}" 2>/dev/null || true
  for _ in $(seq 1 20); do
    pgrep -f "chrome-cdp-profile.*remote-debugging-port=${PORT}" >/dev/null 2>&1 || break
    sleep 0.25
  done
  if pgrep -f "chrome-cdp-profile.*remote-debugging-port=${PORT}" >/dev/null 2>&1; then
    pkill -9 -f "chrome-cdp-profile.*remote-debugging-port=${PORT}" 2>/dev/null || true
    sleep 0.5
  fi
fi

# Reclaim again in case Chrome restart raced a squat.
reclaim_non_cdp_squat

nohup "$CHROME_BIN" \
  --remote-debugging-port="${PORT}" \
  --remote-debugging-address="${BIND_ADDR}" \
  --remote-allow-origins='*' \
  --user-data-dir="${PROFILE}" \
  --no-first-run \
  --no-default-browser-check \
  about:blank \
  >>"$LOG" 2>&1 &

for _ in $(seq 1 40); do
  if cdp_ok_ipv4; then
    echo "CDP healthy on 127.0.0.1:${PORT} (profile=${PROFILE})"
    exit 0
  fi
  sleep 0.25
done

# Last-chance: IPv6-only CDP is better than nothing, but report soft failure so
# LaunchAgent/watchdog keep healing toward IPv4.
if cdp_ok; then
  echo "CDP reachable on loopback IPv6 only — IPv4 :${PORT} still blocked; see ${LOG}" >&2
  exit 1
fi

echo "CDP failed to become ready on :${PORT} — see ${LOG}" >&2
exit 1
