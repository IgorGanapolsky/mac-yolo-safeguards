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
  */api/generate)         echo "PIN $*" >> "$MOCK_CALLS" ;;
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

cat > "$BIN/launchctl" <<'MOCK'
#!/usr/bin/env bash
if [ "${1:-}" = "print" ]; then exit "${MOCK_LAUNCHCTL_PRINT_EXIT:-1}"; fi
echo "LAUNCHCTL $*" >> "$MOCK_CALLS"
exit 0
MOCK

chmod +x "$BIN/curl" "$BIN/pgrep" "$BIN/pybin" "$BIN/launchctl"

# Run the watchdog with a fresh isolated state for one scenario. Args: KEY=VAL env.
run_wd() {
  : > "$TMP/calls"; : > "$TMP/start"
  env \
    HERMES_CURL_BIN="$BIN/curl" \
    HERMES_PGREP_BIN="$BIN/pgrep" \
    HERMES_PYBIN="$BIN/pybin" \
    HERMES_LAUNCHCTL_BIN="$BIN/launchctl" \
    HERMES_GUI_DOMAIN="gui/501" \
    HERMES_GATEWAY_LABEL="ai.hermes.gateway" \
    HERMES_GATEWAY_PLIST="$TMP/ai.hermes.gateway.plist" \
    HERMES_ENV_FILE="$TMP/env" \
    HERMES_WATCHDOG_LOG="$TMP/wd.log" \
    HERMES_WATCHDOG_STATE="$TMP/state" \
    HERMES_AGENT_LOG="$TMP/agent.log" \
    HERMES_WARMUP_COUNT="2" \
    HERMES_MEMORY_PRESSURE_LEVEL="1" \
    HERMES_NOW_EPOCH="1000" \
    YOLO_MEMORY_RECOVERY_FILE="$TMP/recovery-until" \
    YOLO_HERMES_GATEWAY_CIRCUIT_FILE="$TMP/circuit-open" \
    MOCK_HEALTH="$TMP/health" \
    MOCK_PS="$TMP/ps" \
    MOCK_CALLS="$TMP/calls" \
    MOCK_START="$TMP/start" \
    MOCK_GATEWAY_PID="$TMP/gwpid" \
    "$@" \
    bash "$WD"
  # The gateway start remains asynchronous; pin/warmup are deliberately synchronous.
  for _ in $(seq 1 10); do
    grep -q "STARTED\|PIN\|WARMUP" "$TMP/start" "$TMP/calls" 2>/dev/null && break
    sleep 0.05
  done
}

calls() { grep -c "$1" "$TMP/calls" 2>/dev/null || true; }

echo "=== hermes-gateway-watchdog unit tests ==="

# T0: syntax valid.
if bash -n "$WD"; then ok "watchdog passes 'bash -n' syntax check"; else bad "watchdog FAILS syntax check"; fi

printf 'API_SERVER_KEY=testkey123\n' > "$TMP/env"
printf '<plist/>\n' > "$TMP/ai.hermes.gateway.plist"
rm -f "$TMP/circuit-open"

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

# T4: default is on-demand, so an absent model is not pinned.
echo 200 > "$TMP/health"; echo '{"models":[]}' > "$TMP/ps"; echo 4242 > "$TMP/gwpid"; echo 4242 > "$TMP/state"
run_wd
[ "$(calls PIN)" -eq 0 ] \
  && ok "T4: default on-demand mode -> absent model is not pinned" \
  || bad "T4: default mode unexpectedly pinned an absent model"

# T4b: explicit pin opt-in is bounded and synchronous (never keep_alive=-1).
run_wd HERMES_PIN_MODEL="1" HERMES_PIN_KEEP_ALIVE="2m"
if [ "$(calls PIN)" -eq 1 ] && grep -q '\"keep_alive\":\"2m\"' "$TMP/calls" \
  && ! grep -q 'keep_alive.*-1' "$TMP/calls"; then
  ok "T4b: explicit pin uses bounded keep_alive=2m"
else
  bad "T4b: explicit pin was absent, repeated, or unbounded"
fi

# T5: model resident -> no pin.
echo 200 > "$TMP/health"; echo '{"models":["qwen3:8b-64k"]}' > "$TMP/ps"; echo 4242 > "$TMP/gwpid"; echo 4242 > "$TMP/state"
run_wd HERMES_PIN_MODEL="1"
[ "$(calls PIN)" -eq 0 ] \
  && ok "T5: model resident -> no redundant pin" \
  || bad "T5: pinned an already-resident model"

# T5b: explicit HERMES_PIN_MODEL=0 remains an effective override.
echo 200 > "$TMP/health"; echo '{"models":[]}' > "$TMP/ps"; echo 4242 > "$TMP/gwpid"; echo 4242 > "$TMP/state"
run_wd HERMES_PIN_MODEL="0"
[ "$(calls PIN)" -eq 0 ] \
  && ok "T5b: pin disabled -> no pin even when model absent" \
  || bad "T5b: pinned despite HERMES_PIN_MODEL=0"

# T5c: kernel pressure suppresses both an explicit pin and a pending warmup.
echo 200 > "$TMP/health"; echo '{"models":[]}' > "$TMP/ps"; echo 5555 > "$TMP/gwpid"; echo 4242 > "$TMP/state"
run_wd HERMES_PIN_MODEL="1" HERMES_MEMORY_PRESSURE_LEVEL="2"
if [ "$(calls PIN)" -eq 0 ] && [ "$(calls WARMUP)" -eq 0 ] && [ "$(cat "$TMP/state")" = "4242" ]; then
  ok "T5c: kernel pressure blocks pin and pre-warm"
else
  bad "T5c: pressure gate allowed pin/warmup or advanced state"
fi

# T5d: guardian cooldown continues blocking reload after pressure falls.
echo 1600 > "$TMP/recovery-until"
run_wd HERMES_PIN_MODEL="1" HERMES_MEMORY_PRESSURE_LEVEL="1" HERMES_NOW_EPOCH="1000"
if [ "$(calls PIN)" -eq 0 ] && [ "$(calls WARMUP)" -eq 0 ]; then
  ok "T5d: shared recovery cooldown blocks model reload"
else
  bad "T5d: cooldown gate allowed pin/warmup"
fi
: > "$TMP/recovery-until"

# T5e: a down/absent gateway stays down while the guardian's recovery circuit
# is open, then becomes restart-eligible immediately after expiry.
echo 000 > "$TMP/health"; echo '{"models":[]}' > "$TMP/ps"; : > "$TMP/gwpid"
echo 1600 > "$TMP/recovery-until"
run_wd HERMES_MEMORY_PRESSURE_LEVEL="1" HERMES_NOW_EPOCH="1000"
if ! grep -q "STARTED" "$TMP/start" \
  && grep -q 'gateway down.*during memory recovery.*leave stopped' "$TMP/wd.log"; then
  ok "T5e: recovery circuit keeps a down gateway stopped"
else
  bad "T5e: watchdog restarted a gateway during recovery"
fi
run_wd HERMES_MEMORY_PRESSURE_LEVEL="1" HERMES_NOW_EPOCH="1601"
grep -q "STARTED" "$TMP/start" \
  && ok "T5e: gateway restart resumes after recovery expiry" \
  || bad "T5e: gateway did not restart after recovery expiry"
: > "$TMP/recovery-until"

# T5f: an opened guardian circuit survives KeepAlive/self-heal attempts, then
# restores launchd ownership exactly once after pressure and cooldown clear.
echo 000 > "$TMP/health"; echo '{"models":[]}' > "$TMP/ps"; : > "$TMP/gwpid"
echo 1600 > "$TMP/recovery-until"; echo 1600 > "$TMP/circuit-open"
run_wd HERMES_MEMORY_PRESSURE_LEVEL="1" HERMES_NOW_EPOCH="1000"
if grep -q '^LAUNCHCTL disable gui/501/ai.hermes.gateway$' "$TMP/calls" \
  && grep -q '^LAUNCHCTL bootout gui/501/ai.hermes.gateway$' "$TMP/calls" \
  && [ -f "$TMP/circuit-open" ] && ! grep -q 'STARTED' "$TMP/start"; then
  ok "T5f: open circuit enforces launchd disable/bootout"
else
  bad "T5f: open circuit did not enforce launchd disable/bootout"
fi
: > "$TMP/recovery-until"
run_wd HERMES_MEMORY_PRESSURE_LEVEL="1" HERMES_NOW_EPOCH="1601"
if grep -q '^LAUNCHCTL enable gui/501/ai.hermes.gateway$' "$TMP/calls" \
  && grep -q "^LAUNCHCTL bootstrap gui/501 $TMP/ai.hermes.gateway.plist$" "$TMP/calls" \
  && grep -q '^LAUNCHCTL kickstart -k gui/501/ai.hermes.gateway$' "$TMP/calls" \
  && [ ! -e "$TMP/circuit-open" ] && ! grep -q 'STARTED' "$TMP/start"; then
  ok "T5f: expired circuit restores launchd ownership without a duplicate manual start"
else
  bad "T5f: expired circuit did not restore launchd ownership safely"
fi

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

# T7b: pre-warm is disabled by default when no explicit count is configured.
echo 200 > "$TMP/health"; echo '{"models":[]}' > "$TMP/ps"; echo 7777 > "$TMP/gwpid"; echo 5555 > "$TMP/state"
run_wd HERMES_WARMUP_COUNT="0"
[ "$(calls WARMUP)" -eq 0 ] && [ "$(cat "$TMP/state")" = "5555" ] \
  && ok "T7b: default-style warmup count 0 leaves the model on demand" \
  || bad "T7b: disabled warmup still issued calls or changed state"

# T8: no API key in env -> pre-warm is skipped safely (no crash, no warmup).
: > "$TMP/env"
echo 200 > "$TMP/health"; echo '{"models":["qwen3:8b-64k"]}' > "$TMP/ps"; echo 6666 > "$TMP/gwpid"; echo 4242 > "$TMP/state"
run_wd
[ "$(calls WARMUP)" -eq 0 ] \
  && ok "T8: missing API key -> warmup skipped (no crash)" \
  || bad "T8: attempted warmup without an API key"

# T9: healthy gateway -> refreshes the vault presence file (fixes "Hermes away" badge).
echo 200 > "$TMP/health"; echo '{"models":["qwen3:8b-64k"]}' > "$TMP/ps"; echo 4242 > "$TMP/gwpid"; echo 4242 > "$TMP/state"
touch -t 202001010000 "$TMP/presence.md"
run_wd HERMES_PRESENCE_FILE="$TMP/presence.md"
[ "$(find "$TMP/presence.md" -newermt "2020-06-01" 2>/dev/null)" = "$TMP/presence.md" ] \
  && ok "T9: healthy gateway -> refreshes presence file mtime" \
  || bad "T9: presence file mtime not refreshed on a healthy gateway"

# T10: gateway down -> must NOT touch presence (let a dead gateway age out to "away").
echo 000 > "$TMP/health"; echo '{"models":["qwen3:8b-64k"]}' > "$TMP/ps"; : > "$TMP/gwpid"
touch -t 202001010000 "$TMP/presence.md"
run_wd HERMES_PRESENCE_FILE="$TMP/presence.md"
[ -z "$(find "$TMP/presence.md" -newermt "2020-06-01" 2>/dev/null)" ] \
  && ok "T10: down gateway -> presence file left stale (ages out to away)" \
  || bad "T10: refreshed presence while gateway was down (would mask an outage)"

# T11: presence file missing -> no crash, nothing created.
echo 200 > "$TMP/health"; echo '{"models":["qwen3:8b-64k"]}' > "$TMP/ps"; echo 4242 > "$TMP/gwpid"; echo 4242 > "$TMP/state"
rm -f "$TMP/presence.md"
run_wd HERMES_PRESENCE_FILE="$TMP/presence.md"
[ ! -f "$TMP/presence.md" ] \
  && ok "T11: missing presence file -> not created, no crash" \
  || bad "T11: created a presence file that did not exist"

echo ""
echo "=== $pass passed, $fail failed ==="
[ "$fail" -eq 0 ]
