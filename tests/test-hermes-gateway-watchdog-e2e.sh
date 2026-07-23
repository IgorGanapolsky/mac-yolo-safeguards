#!/usr/bin/env bash
# End-to-end orchestration suite for scripts/hermes-gateway-watchdog.sh.
#
# Unlike the unit tests (which mock curl/pgrep/pybin), this drives the REAL watchdog
# against a REAL process over REAL HTTP on loopback: real `nohup` start, real `pgrep`
# matching, real `curl` health/pin/warmup, and a real crash + auto-recovery. It proves
# the full lifecycle the user depends on for 24/7 reliability:
#
#   Phase A  cold boot     : no gateway -> watchdog launches it -> healthy -> on-demand + pre-warm
#   Phase B  steady state  : same pid   -> no double-start, no forced pin, no re-warm (idempotent)
#   Phase C  crash recovery: gateway killed -> cooldown holds it down -> expiry
#             permits relaunch -> healthy -> re-warm new pid
#
# Requires only python3 (present on CI runners); no live Ollama/gateway needed.
set -u

REPO="$(cd "$(dirname "$0")/.." && pwd)"
WD="$REPO/scripts/hermes-gateway-watchdog.sh"
FAKE_GW="$REPO/tests/e2e/fake-hermes-gateway.py"
TMP="$(mktemp -d "${TMPDIR:-/tmp}/hermes-wd-e2e.XXXXXX")"

PYTHON="${PYTHON:-python3}"
MODEL="e2e-model-$$"
TOKEN="FAKE_HERMES_GW_E2E_$$_${RANDOM}"

pass=0; fail=0
G="\033[32m"; R="\033[31m"; Z="\033[0m"
ok()  { printf "  ${G}[PASS]${Z} %s\n" "$1"; pass=$((pass + 1)); }
bad() { printf "  ${R}[FAIL]${Z} %s\n" "$1"; fail=$((fail + 1)); }

cleanup() {
  pkill -f "$TOKEN" 2>/dev/null || true
  rm -rf "$TMP"
}
trap cleanup EXIT INT TERM

# --- Free loopback port ------------------------------------------------------
PORT="$("$PYTHON" - <<'PY'
import socket
s = socket.socket()
s.bind(("127.0.0.1", 0))
print(s.getsockname()[1])
s.close()
PY
)"

BASE="http://127.0.0.1:$PORT"
REQLOG="$TMP/reqlog"
: > "$REQLOG"
printf 'API_SERVER_KEY=e2ekey\n' > "$TMP/env"

# The watchdog invokes PYBIN as `PYBIN -m hermes_cli.main gateway run`. This launcher
# ignores those args and instead backgrounds the fake gateway carrying $TOKEN in argv,
# exactly mirroring how the real launcher spawns a pgrep-findable gateway process.
BIN="$TMP/bin"; mkdir -p "$BIN"
cat > "$BIN/pybin" <<LAUNCHER
#!/usr/bin/env bash
nohup "$PYTHON" "$FAKE_GW" --port "$PORT" --reqlog "$REQLOG" --token "$TOKEN" --model "$MODEL" \
  >/dev/null 2>&1 &
exit 0
LAUNCHER
chmod +x "$BIN/pybin"

# --- Helpers -----------------------------------------------------------------
run_wd() {
  env \
    HERMES_HEALTH_URL="$BASE/health" \
    HERMES_CHAT_URL="$BASE/v1/chat/completions" \
    HERMES_OLLAMA_URL="$BASE" \
    HERMES_MODEL="$MODEL" \
    HERMES_PYBIN="$BIN/pybin" \
    HERMES_ENV_FILE="$TMP/env" \
    HERMES_AGENT_LOG="$TMP/agent.log" \
    HERMES_WATCHDOG_LOG="$TMP/wd.log" \
    HERMES_WATCHDOG_STATE="$TMP/state" \
    HERMES_GATEWAY_MATCH="$TOKEN" \
    HERMES_PIN_MODEL="0" \
    HERMES_WARMUP_COUNT="2" \
    HERMES_MEMORY_PRESSURE_LEVEL="1" \
    HERMES_NOW_EPOCH="1000" \
    YOLO_MEMORY_RECOVERY_FILE="$TMP/recovery-until" \
    YOLO_HERMES_GATEWAY_CIRCUIT_FILE="$TMP/circuit-open" \
    bash "$WD"
}

health() { curl -s -m5 -o /dev/null -w "%{http_code}" "$BASE/health" 2>/dev/null || echo 000; }

wait_health() {  # wait_health ; returns 0 once health is 200 within ~10s
  local i=0
  while [ "$i" -lt 100 ]; do
    [ "$(health)" = "200" ] && return 0
    sleep 0.1; i=$((i + 1))
  done
  return 1
}

wait_down() {  # returns 0 once health is anything but 200 (curl prints 000 on refuse)
  local i=0
  while [ "$i" -lt 100 ]; do
    [ "$(health)" != "200" ] && return 0
    sleep 0.1; i=$((i + 1))
  done
  return 1
}

count() { grep -c "^$1$" "$REQLOG" 2>/dev/null || true; }
gw_pids() { pgrep -f "$TOKEN" 2>/dev/null || true; }

echo "=== hermes-gateway-watchdog e2e orchestration suite ==="

# Precondition: syntax valid + nothing already listening on our token/port.
if bash -n "$WD"; then ok "watchdog passes 'bash -n' syntax check"; else bad "watchdog FAILS syntax check"; fi
[ "$(health)" != "200" ] && ok "precondition: no gateway on port $PORT" \
  || bad "precondition: something already answering on port $PORT"

# --- Phase A: cold boot ------------------------------------------------------
run_wd                                    # detects down + no proc -> launches gateway
if wait_health; then ok "A: watchdog cold-booted the gateway (health 200)"; \
  else bad "A: gateway never came healthy after cold boot"; fi
[ -n "$(gw_pids)" ] && ok "A: a real gateway process is running (pgrep by token)" \
  || bad "A: no gateway process found by pgrep"

run_wd; sleep 0.4                         # next tick: now healthy -> on-demand + pre-warm
[ "$(count PIN)" -eq 0 ] && ok "A: default on-demand mode did not force model residency" \
  || bad "A: default mode unexpectedly pinned a model"
[ "$(count WARMUP)" -eq 2 ] && ok "A: pre-warmed exactly WARMUP_COUNT (2) turns" \
  || bad "A: expected 2 warmup turns, got $(count WARMUP)"
boot_pid="$(cat "$TMP/state" 2>/dev/null || echo "")"
[ -n "$boot_pid" ] && ok "A: warmed pid recorded in state ($boot_pid)" \
  || bad "A: state file never recorded a warmed pid"

# --- Phase B: steady state (idempotent ticks) --------------------------------
pin_before="$(count PIN)"; warm_before="$(count WARMUP)"
run_wd; sleep 0.4
run_wd; sleep 0.4
[ "$(count PIN)" -eq "$pin_before" ] && ok "B: steady ticks did not force model residency" \
  || bad "B: steady tick unexpectedly pinned a model"
[ "$(count WARMUP)" -eq "$warm_before" ] && ok "B: warm gateway not re-warmed (idempotent)" \
  || bad "B: re-warmed an already-warm gateway"
[ "$(cat "$TMP/state" 2>/dev/null)" = "$boot_pid" ] && ok "B: pid unchanged across steady ticks" \
  || bad "B: state pid drifted while gateway was stable"

# --- Phase C: crash recovery -------------------------------------------------
pkill -f "$TOKEN" 2>/dev/null || true
if wait_down; then ok "C: gateway crash detected (health != 200)"; \
  else bad "C: killed gateway still answering"; fi

warm_before_c="$(count WARMUP)"
echo 1600 > "$TMP/recovery-until"
run_wd                                    # recovery circuit must keep it down
sleep 0.4
if [ "$(health)" != "200" ] && [ -z "$(gw_pids)" ]; then
  ok "C: recovery cooldown keeps the crashed gateway stopped"
else
  bad "C: watchdog restarted the gateway during recovery cooldown"
fi
: > "$TMP/recovery-until"
run_wd                                    # cooldown expired -> relaunch
if wait_health; then ok "C: watchdog auto-recovered the gateway (health 200)"; \
  else bad "C: gateway never recovered after crash"; fi

run_wd; sleep 0.4                         # next tick: fresh pid -> re-warm
recover_pid="$(cat "$TMP/state" 2>/dev/null || echo "")"
[ -n "$recover_pid" ] && [ "$recover_pid" != "$boot_pid" ] \
  && ok "C: state advanced to the recovered pid ($boot_pid -> $recover_pid)" \
  || bad "C: state pid did not advance after recovery"
[ "$(count WARMUP)" -gt "$warm_before_c" ] && ok "C: recovered gateway was re-warmed" \
  || bad "C: recovered gateway never pre-warmed"

echo ""
echo "=== $pass passed, $fail failed ==="
[ "$fail" -eq 0 ]
