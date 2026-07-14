#!/usr/bin/env bash
# Start / heal Hermes Chrome with remote debugging on port 9222.
# Never disables the browser toolset — heal CDP instead (NO-CONSTRAINTS policy).
set -euo pipefail

PORT="${HERMES_CDP_PORT:-9222}"
PROFILE="${HERMES_CDP_PROFILE:-${HOME}/.hermes/chrome-cdp-profile}"
LOG="${HERMES_CDP_LOG:-${HOME}/Library/Logs/hermes-chrome-cdp.log}"
CHROME_BIN="${HERMES_CHROME_BIN:-/Applications/Google Chrome.app/Contents/MacOS/Google Chrome}"

mkdir -p "$(dirname "$LOG")" "$PROFILE"

cdp_ok() {
  curl -sf --max-time 2 "http://127.0.0.1:${PORT}/json/version" >/dev/null 2>&1
}

if cdp_ok; then
  echo "CDP already healthy on :${PORT}"
  exit 0
fi

if [[ ! -x "$CHROME_BIN" ]]; then
  echo "Chrome binary missing: $CHROME_BIN" >&2
  exit 1
fi

# Kill only a prior hermes CDP profile instance on this port (not the user's daily Chrome).
if pgrep -f "chrome-cdp-profile.*remote-debugging-port=${PORT}" >/dev/null 2>&1; then
  pkill -f "chrome-cdp-profile.*remote-debugging-port=${PORT}" 2>/dev/null || true
  sleep 1
fi

nohup "$CHROME_BIN" \
  --remote-debugging-port="${PORT}" \
  --remote-allow-origins='*' \
  --user-data-dir="${PROFILE}" \
  --no-first-run \
  --no-default-browser-check \
  about:blank \
  >>"$LOG" 2>&1 &

for _ in $(seq 1 40); do
  if cdp_ok; then
    echo "CDP healthy on :${PORT} (profile=${PROFILE})"
    exit 0
  fi
  sleep 0.25
done

echo "CDP failed to become ready on :${PORT} — see ${LOG}" >&2
exit 1
