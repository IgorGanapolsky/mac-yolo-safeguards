#!/bin/sh
# E2E coverage for the secondary-browser memory-reclaim branch of
# sim-runaway-guard.sh. Spawns fake processes (via `exec -a` so they carry a
# real .app-shaped argv but are just `sleep`), runs the guard under fully
# overridden env + temp state, and asserts which procs are killed vs protected.
#
# Fully isolated: every state file, the log, and the webhook are redirected to
# throwaway sinks, so this never touches real /tmp guard state, never pages a
# phone (webhook -> discard port), and never targets a real browser (the
# secondary-browser list is overridden to a fake name with no installed .app,
# so the osascript `quit` is a harmless no-op).
set -u

REPO="$(cd "$(dirname "$0")/.." && pwd)"
GUARD="$REPO/sim-runaway-guard.sh"
TMP="$(mktemp -d /tmp/yolo-guard-test.XXXXXX)"
trap 'pkill -9 -f "YoloFake" 2>/dev/null; pkill -9 -f "FakePrimaryChrome" 2>/dev/null; pkill -9 -f "FakeHermesProc" 2>/dev/null; pkill -9 -f "semgrep-core" 2>/dev/null; pkill -9 -f "ollama runner" 2>/dev/null; pkill -9 -f "com.semmle.cli2.CodeQL" 2>/dev/null; rm -rf "$TMP"' EXIT INT TERM

pass=0; fail=0
G="\033[32m"; R="\033[31m"; Z="\033[0m"
ok()   { printf "  ${G}[PASS]${Z} %s\n" "$1"; pass=$((pass+1)); }
bad()  { printf "  ${R}[FAIL]${Z} %s\n" "$1"; fail=$((fail+1)); }
alive(){ kill -0 "$1" 2>/dev/null; }

# Spawn a process whose argv0 is $1 (a .app-shaped path) but is really `sleep`.
mkfake() { /bin/bash -c "exec -a \"$1\" sleep 600" >/dev/null 2>&1 & echo $!; }
mkbusyfake() { /bin/bash -c "exec -a \"$1\" yes >/dev/null" >/dev/null 2>&1 & echo $!; }

# Run the guard with isolated state + FORCED memory pressure (free<200% always
# true) unless overridden by the caller's extra env.
run_guard() {
  env \
    YOLO_LOG="$TMP/guard.log" \
    YOLO_FIRES_LOG="$TMP/fires.log" \
    YOLO_CPU_STATE_FILE="$TMP/cpu-state" \
    YOLO_CPU_LAST_FILE="$TMP/cpu-last" \
    YOLO_CPU_STATUS_FILE="$TMP/cpu-status.txt" \
    YOLO_CODEQL_STATE_FILE="$TMP/codeql-state" \
    YOLO_CODEQL_EXTENSION_DIRS="$TMP/cursor-codeql $TMP/ag-codeql" \
    YOLO_BOOTED_SIM_STATE_FILE="$TMP/booted-sim-state" \
    YOLO_PAGEOUT_STATE_FILE="$TMP/pageouts" \
    YOLO_MEM_LAST_FILE="$TMP/mem-last" \
    YOLO_STATUS_FILE="$TMP/status.txt" \
    YOLO_MEM_APP_LAST_FILE="$TMP/mem-app-last" \
    YOLO_MEM_APP_STATUS_FILE="$TMP/mem-app-status.txt" \
    YOLO_WEBHOOK_URL="http://127.0.0.1:9" \
    YOLO_MEM_FREE_PCT_THRESHOLD="${FREE_T:-200}" \
    YOLO_SWAP_PCT_THRESHOLD="${SWAP_T:-80}" \
    "$@" \
    /bin/sh "$GUARD" >/dev/null 2>&1
}

echo "=== sim-runaway-guard: secondary-browser reclaim E2E ==="

# T6 (cheap, first): script is syntactically valid.
if /bin/sh -n "$GUARD"; then ok "guard passes 'sh -n' syntax check"; else bad "guard FAILS syntax check"; fi

# --- T1+T2: under pressure, reclaim the secondary browser, protect the rest ---
SEC="$TMP/YoloFakeBrowser.app/Contents/MacOS/YoloFakeBrowser"
PRI="$TMP/FakePrimaryChrome.app/Contents/MacOS/FakePrimaryChrome"
HRM="$TMP/FakeHermesProc.app/Contents/MacOS/FakeHermesProc"
SEC_PID=$(mkfake "$SEC"); PRI_PID=$(mkfake "$PRI"); HRM_PID=$(mkfake "$HRM")
sleep 1
run_guard YOLO_SECONDARY_BROWSERS="YoloFakeBrowser"
sleep 1
alive "$SEC_PID" && bad "T1: secondary browser was NOT reclaimed under pressure" \
                 || ok  "T1: secondary browser reclaimed under memory pressure"
grep -q "BROWSER_RECLAIM: YoloFakeBrowser" "$TMP/guard.log" \
  && ok  "T1: BROWSER_RECLAIM logged" || bad "T1: no BROWSER_RECLAIM log line"
alive "$PRI_PID" && ok  "T2: non-listed 'primary Chrome' proc PROTECTED" \
                 || bad "T2: protected primary proc was killed (scoping bug!)"
alive "$HRM_PID" && ok  "T2: Hermes-shaped proc PROTECTED" \
                 || bad "T2: Hermes-shaped proc was killed (must never happen!)"
kill -9 "$PRI_PID" "$HRM_PID" 2>/dev/null

# --- T3: opt-out (YOLO_RECLAIM_SECONDARY_BROWSERS=0) leaves it alone ---
OPT="$TMP/YoloFakeBrowser.app/Contents/MacOS/YoloFakeBrowser"
OPT_PID=$(mkfake "$OPT"); sleep 1
run_guard YOLO_RECLAIM_SECONDARY_BROWSERS="0" YOLO_SECONDARY_BROWSERS="YoloFakeBrowser"
sleep 1
alive "$OPT_PID" && ok  "T3: opt-out (=0) leaves secondary browser running" \
                 || bad "T3: opt-out IGNORED — proc killed with reclaim disabled"
kill -9 "$OPT_PID" 2>/dev/null

# --- T4: NO memory pressure => reclaim block never runs ---
NOP_PID=$(mkfake "$SEC"); sleep 1
# FREE_T/SWAP_T must be set in the FUNCTION's scope (it expands ${FREE_T:-200}
# before forwarding "$@"), so prefix the call rather than passing them as args.
FREE_T="0" SWAP_T="999" run_guard YOLO_SECONDARY_BROWSERS="YoloFakeBrowser"
sleep 1
alive "$NOP_PID" && ok  "T4: no pressure => secondary browser untouched" \
                 || bad "T4: killed a browser with NO memory pressure (false fire!)"
kill -9 "$NOP_PID" 2>/dev/null

# --- T5: signature string-safety — primary 'Google Chrome' must NOT match a
#         secondary-channel signature; each channel matches only itself. ---
CANARY_SIG="Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary"
PRIMARY="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
CANARY="/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary"
printf '%s' "$PRIMARY" | grep -qF "$CANARY_SIG" \
  && bad "T5: primary Chrome path WRONGLY matches Canary signature" \
  || ok  "T5: primary 'Google Chrome' does NOT match Canary signature"
printf '%s' "$CANARY" | grep -qF "$CANARY_SIG" \
  && ok  "T5: Canary path correctly matches its own signature" \
  || bad "T5: Canary path failed to match its own signature"

# --- T7: CPU runaway autokill for allowlisted background process ---
CPU_K="semgrep-core"
CPU_PID=$(mkfake "$CPU_K")
sleep 1
run_guard YOLO_CPU_PCT_THRESHOLD="0" YOLO_CPU_SUSTAINED_FIRES="1" YOLO_CPU_AUTOKILL_CMD_PATTERNS="semgrep-core"
sleep 1
alive "$CPU_PID" && bad "T7: CPU runaway process was NOT killed" \
                 || ok  "T7: CPU runaway process autokilled on sustained CPU check"
kill -9 "$CPU_PID" 2>/dev/null

# --- T8: aggregate memory reporting includes Comet browser processes ---
COMET="$TMP/Comet.app/Contents/MacOS/Comet"
COMET_PID=$(mkfake "$COMET")
sleep 1
FREE_T="200" SWAP_T="80" run_guard YOLO_MEM_APP_AGG_MB_THRESHOLD="0" YOLO_MEM_APP_LAST_FILE="$TMP/mem-app-last-comet"
grep -q "App:   Comet" "$TMP/mem-app-status.txt" \
  && ok  "T8: aggregate memory report includes Comet" \
  || bad "T8: Comet missing from aggregate memory report"
kill -9 "$COMET_PID" 2>/dev/null

# --- T9: Ollama runner workers are reclaimed under memory pressure ---
OLLAMA_PID=$(mkfake "ollama runner")
sleep 1
run_guard YOLO_OLLAMA_RSS_MB_THRESHOLD="0"
sleep 1
alive "$OLLAMA_PID" && bad "T9: Ollama runner was NOT reclaimed under pressure" \
                    || ok  "T9: Ollama runner reclaimed under memory pressure"
grep -q "OLLAMA_RECLAIM: killed Ollama worker" "$TMP/guard.log" \
  && ok  "T9: OLLAMA_RECLAIM logged" || bad "T9: no OLLAMA_RECLAIM log line"
kill -9 "$OLLAMA_PID" 2>/dev/null

# --- T10: aggregate CodeQL workers are killed and repeated respawn disables dirs ---
mkdir -p "$TMP/cursor-codeql" "$TMP/ag-codeql"
CODEQL1=$(mkbusyfake "java com.semmle.cli2.CodeQL execute language-server")
CODEQL2=$(mkbusyfake "java com.semmle.cli2.CodeQL execute language-server")
# Let busy fakes accumulate CPU % before ps sampling (GitHub macOS runners are slow).
sleep 2
# FREE_T/SWAP_T must be set in the shell scope (see T4); disable memory-pressure side paths.
FREE_T="0" SWAP_T="999" run_guard \
  YOLO_CPU_PCT_THRESHOLD="9999" \
  YOLO_CPU_AUTOKILL_CMD_PATTERNS="semgrep-core" \
  YOLO_CODEQL_CPU_PCT_THRESHOLD="1" \
  YOLO_CODEQL_CPU_TOTAL_THRESHOLD="2" \
  YOLO_CODEQL_MIN_PROCS="2" \
  YOLO_CODEQL_SUSTAINED_FIRES="1" \
  YOLO_CODEQL_DISABLE_AFTER_FIRES="1"
sleep 1
if alive "$CODEQL1" || alive "$CODEQL2"; then
  bad "T10: aggregate CodeQL workers were NOT reclaimed"
else
  ok  "T10: aggregate CodeQL workers reclaimed under CPU pressure"
fi
grep -q "CODEQL_KILL:" "$TMP/guard.log" \
  && ok  "T10: CODEQL_KILL logged" || bad "T10: no CODEQL_KILL log line"
[ -d "$TMP/cursor-codeql.disabled-$(date +%Y%m%d)" ] && [ -d "$TMP/ag-codeql.disabled-$(date +%Y%m%d)" ] \
  && ok  "T10: CodeQL extension dirs disabled by reversible rename" \
  || bad "T10: CodeQL extension dirs were not disabled"
kill -9 "$CODEQL1" "$CODEQL2" 2>/dev/null

echo ""
echo "=== $pass passed, $fail failed ==="
[ "$fail" -eq 0 ]
