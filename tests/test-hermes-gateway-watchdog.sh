#!/usr/bin/env bash
# Unit tests for scripts/hermes-gateway-watchdog.sh.
#
# The watchdog's external commands (curl, pgrep, the python gateway launcher) and all
# paths are env-overridable, so each decision branch is exercised in full isolation:
# mock curl replays canned health/ollama responses and records pin/warmup calls, mock
# pgrep replays a configurable gateway pid, and the mock PYBIN records a start instead
# of launching anything. Nothing real is started, killed, or network-called.
set -u

REPO="$(cd "$(dirname "$0")/.." && pwd)"
WD="$REPO/scripts/hermes-gateway-watchdog.sh"
TMP="$(mktemp -d "${TMPDIR:-/tmp}/hermes-wd-test.XXXXXX")"
trap 'rm -rf "$TMP"' EXIT INT TERM

pass=0; fail=0
G="\033[32m"; R="\033[31m"; Z="\033[0m"
ok()  { printf "  ${G}[PASS]${Z} %s\n" "$1"; pass=$((pass + 1)); }
bad() { printf "  ${R}[FAIL]${Z} %s\n" "$1"; fail=$((fail + 1)); }

# --- Mock binaries -----------------------------------------------------------
BIN="$TMP/bin"; mkdir -p "$BIN"

cat > "$BIN/curl" <<'MOCK'
#!/usr/bin/env bash
# Routes by the http URL in argv. Health/ps replay files; generate/chat are recorded.
url=""
for a in "$@"; do case "$a" in http://*) url="$a" ;; esac; done
case "$url" in
  */health)               cat "$MOCK_HEALTH" 2>/dev/null || echo 000 ;;
  */api/ps)               cat "$MOCK_PS" 2>/dev/null || echo '{"models":[]}' ;;
  */api/generate)         echo "PIN" >> "$MOCK_CALLS" ;;
  */v1/chat/completions)  echo "WARMUP" >> "$MOCK_CALLS" ;;
esac
exit 0
MOCK

cat > "$BIN/pgrep" <<'MOCK'
#!/usr/bin/env bash
cat "$MOCK_GATEWAY_PID" 2>/dev/null || true
exit 0
MOCK

cat > "$BIN/pybin" <<'MOCK'
#!/usr/bin/env bash
echo "STARTED $*" >> "$MOCK_START"
exit 0
MOCK

chmod +x "$BIN/curl" "$BIN/pgrep" "$BIN/pybin"

# Run the watchdog with a fresh isolated state for one scenario. Args: KEY=VAL env.
run_wd() {
  : > "$TMP/calls"; : > "$TMP/start"
  env \
    HERMES_CURL_BIN="$BIN/curl" \
    HERMES_PGREP_BIN="$BIN/pgrep" \
    HERMES_PYBIN="$BIN/pybin" \
    HERMES_ENV_FILE="$TMP/env" \
    HERMES_WATCHDOG_LOG="$TMP/wd.log" \
    HERMES_WATCHDOG_STATE="$TMP/state" \
    HERMES_AGENT_LOG="$TMP/agent.log" \
    HERMES_WARMUP_COUNT="2" \
    MOCK_HEALTH="$TMP/health" \
    MOCK_PS="$TMP/ps" \
    MOCK_CALLS="$TMP/calls" \
    MOCK_START="$TMP/start" \
    MOCK_GATEWAY_PID="$TMP/gwpid" \
    "$@" \
    bash "$WD"
  # Give backgrounded pin/start (&) a moment to flush their mock output.
  sleep 0.3
}

calls() { grep -c "$1" "$TMP/calls" 2>/dev/null || true; }

echo "=== hermes-gateway-watchdog unit tests ==="

# T0: syntax valid.
if bash -n "$WD"; then ok "watchdog passes 'bash -n' syntax check"; else bad "watchdog FAILS syntax check"; fi

printf 'API_SERVER_KEY=testkey123\n' > "$TMP/env"

# T1: gateway down + no proc -> starts gateway.
echo 000 > "$TMP/health"; echo '{"models":["qwen3:8b-64k"]}' > "$TMP/ps"; : > "$TMP/gwpid"
run_wd
grep -q "STARTED" "$TMP/start" \
  && ok "T1: gateway down + no proc -> launches gateway" \
  || bad "T1: gateway not started when down and absent"
grep -q "no proc.*starting" "$TMP/wd.log" \
  && ok "T1: logs the start decision" || bad "T1: missing start log line"

# T2: gateway down but proc alive -> must NOT double-start.
echo 000 > "$TMP/health"; echo '{"models":["qwen3:8b-64k"]}' > "$TMP/ps"; echo 4242 > "$TMP/gwpid"
run_wd
grep -q "STARTED" "$TMP/start" \
  && bad "T2: double-started gateway while a proc was alive (conflict risk!)" \
  || ok "T2: proc alive -> no double-start"

# T3: gateway healthy -> never restarts.
echo 200 > "$TMP/health"; echo '{"models":["qwen3:8b-64k"]}' > "$TMP/ps"; echo 4242 > "$TMP/gwpid"; echo 4242 > "$TMP/state"
run_wd
grep -q "STARTED" "$TMP/start" \
  && bad "T3: restarted a healthy gateway" || ok "T3: healthy gateway -> no restart"

# T4: model NOT resident -> pin call fires (keep_alive).
echo 200 > "$TMP/health"; echo '{"models":[]}' > "$TMP/ps"; echo 4242 > "$TMP/gwpid"; echo 4242 > "$TMP/state"
run_wd
[ "$(calls PIN)" -ge 1 ] \
  && ok "T4: model absent -> pin (keep_alive) request sent" \
  || bad "T4: model absent but no pin request"

# T5: model resident -> no pin.
echo 200 > "$TMP/health"; echo '{"models":["qwen3:8b-64k"]}' > "$TMP/ps"; echo 4242 > "$TMP/gwpid"; echo 4242 > "$TMP/state"
run_wd
[ "$(calls PIN)" -eq 0 ] \
  && ok "T5: model resident -> no redundant pin" \
  || bad "T5: pinned an already-resident model"

# T5b: HERMES_PIN_MODEL=0 -> never pin even when the model is absent (cloud-first node).
echo 200 > "$TMP/health"; echo '{"models":[]}' > "$TMP/ps"; echo 4242 > "$TMP/gwpid"; echo 4242 > "$TMP/state"
run_wd HERMES_PIN_MODEL="0"
[ "$(calls PIN)" -eq 0 ] \
  && ok "T5b: pin disabled -> no pin even when model absent" \
  || bad "T5b: pinned despite HERMES_PIN_MODEL=0"

# T6: pid changed vs state -> pre-warm WARMUP_COUNT times, then records new pid.
echo 200 > "$TMP/health"; echo '{"models":["qwen3:8b-64k"]}' > "$TMP/ps"; echo 5555 > "$TMP/gwpid"; echo 4242 > "$TMP/state"
run_wd
[ "$(calls WARMUP)" -eq 2 ] \
  && ok "T6: fresh gateway pid -> pre-warms exactly WARMUP_COUNT (2) turns" \
  || bad "T6: expected 2 warmup calls, got $(calls WARMUP)"
[ "$(cat "$TMP/state" 2>/dev/null)" = "5555" ] \
  && ok "T6: records warmed pid in state" || bad "T6: state pid not updated to 5555"

# T7: pid unchanged (already warmed) -> no warmup.
echo 200 > "$TMP/health"; echo '{"models":["qwen3:8b-64k"]}' > "$TMP/ps"; echo 5555 > "$TMP/gwpid"; echo 5555 > "$TMP/state"
run_wd
[ "$(calls WARMUP)" -eq 0 ] \
  && ok "T7: already-warmed pid -> no repeat warmup" \
  || bad "T7: re-warmed an already-warm gateway ($(calls WARMUP) calls)"

# T8: no API key in env -> pre-warm is skipped safely (no crash, no warmup).
: > "$TMP/env"
echo 200 > "$TMP/health"; echo '{"models":["qwen3:8b-64k"]}' > "$TMP/ps"; echo 6666 > "$TMP/gwpid"; echo 4242 > "$TMP/state"
run_wd
[ "$(calls WARMUP)" -eq 0 ] \
  && ok "T8: missing API key -> warmup skipped (no crash)" \
  || bad "T8: attempted warmup without an API key"

echo ""
echo "=== $pass passed, $fail failed ==="
[ "$fail" -eq 0 ]
