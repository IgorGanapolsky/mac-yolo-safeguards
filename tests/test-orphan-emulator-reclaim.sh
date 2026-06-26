#!/bin/sh
# E2E coverage for the orphaned-Android-emulator memory-reclaim branch of
# sim-runaway-guard.sh (added 2026-06-25 after a 22h-orphaned Maestro emulator
# starved RAM until Ollama could not load the 64k model and the Hermes agent
# stopped replying to mobile chats).
#
# Spawns fake processes (via `exec -a` so they carry a qemu-shaped argv but are
# just `sleep`), runs the guard under fully overridden env + temp state with
# YOLO_EMULATOR_MAX_AGE_SEC=0 (so age never spares a fresh fake), and asserts:
#   1. a headless orphan with no owner            -> KILLED
#   2. a headless emulator a live test references -> SPARED (multi-agent-safe)
#   3. a NON-headless (windowed) emulator         -> SPARED (never matched)
set -u

REPO="$(cd "$(dirname "$0")/.." && pwd)"
GUARD="$REPO/sim-runaway-guard.sh"
TMP="$(mktemp -d /tmp/yolo-emu-test.XXXXXX)"
trap 'pkill -9 -f "YoloFakeEmu" 2>/dev/null; pkill -9 -f "YoloFakeOwner" 2>/dev/null; rm -rf "$TMP"' EXIT INT TERM

pass=0; fail=0
G="\033[32m"; R="\033[31m"; Z="\033[0m"
ok()   { printf "  ${G}[PASS]${Z} %s\n" "$1"; pass=$((pass+1)); }
bad()  { printf "  ${R}[FAIL]${Z} %s\n" "$1"; fail=$((fail+1)); }
alive(){ kill -0 "$1" 2>/dev/null; }

# Spawn a process whose argv0 is $1 but is really `sleep`.
mkfake() { /bin/bash -c "exec -a \"$1\" sleep 600" >/dev/null 2>&1 & echo $!; }

run_guard() {
  env \
    YOLO_LOG="$TMP/guard.log" \
    YOLO_FIRES_LOG="$TMP/fires.log" \
    YOLO_CPU_STATE_FILE="$TMP/cpu-state" \
    YOLO_CPU_LAST_FILE="$TMP/cpu-last" \
    YOLO_CPU_STATUS_FILE="$TMP/cpu-status.txt" \
    YOLO_CODEQL_STATE_FILE="$TMP/codeql-state" \
    YOLO_BOOTED_SIM_STATE_FILE="$TMP/booted-sim-state" \
    YOLO_PAGEOUT_STATE_FILE="$TMP/pageouts" \
    YOLO_MEM_LAST_FILE="$TMP/mem-last" \
    YOLO_STATUS_FILE="$TMP/status.txt" \
    YOLO_MEM_APP_LAST_FILE="$TMP/mem-app-last" \
    YOLO_MEM_APP_STATUS_FILE="$TMP/mem-app-status.txt" \
    YOLO_WEBHOOK_URL="http://127.0.0.1:9" \
    YOLO_MEM_FREE_PCT_THRESHOLD="200" \
    YOLO_EMULATOR_MAX_AGE_SEC="0" \
    YOLO_RECLAIM_OLLAMA="0" \
    YOLO_RECLAIM_STALE_CDP="0" \
    YOLO_RECLAIM_SECONDARY_BROWSERS="0" \
    "$@" \
    /bin/sh "$GUARD" >/dev/null 2>&1
}

echo "orphan-emulator reclaim:"

# Case 1: headless orphan, no live owner -> should be KILLED
ORPHAN=$(mkfake "YoloFakeEmu/qemu-system-aarch64-headless @Maestro_OrphanAVD_a1 -no-window -gpu swiftshader")
# Case 2: headless emulator OWNED by a live agent-device test (same AVD) -> SPARED
OWNED=$(mkfake "YoloFakeEmu/qemu-system-aarch64-headless @Maestro_OwnedAVD_b2 -no-window -gpu swiftshader")
OWNER=$(mkfake "YoloFakeOwner node agent-device test nav.yaml --avd @Maestro_OwnedAVD_b2")
# Case 3: NON-headless (windowed) emulator -> SPARED (no -no-window)
WINDOWED=$(mkfake "YoloFakeEmu/qemu-system-aarch64 @Maestro_WindowedAVD_c3 -gpu host")

sleep 1
run_guard
sleep 4

alive "$ORPHAN"   && bad "orphan headless emulator should be reclaimed" || ok "reclaimed orphaned headless emulator"
alive "$OWNED"    && ok "spared emulator owned by a live test (multi-agent-safe)" || bad "killed an emulator a live test was using"
alive "$WINDOWED" && ok "spared non-headless (windowed) emulator" || bad "killed a windowed/interactive emulator"

# log line should record the reclaim
if grep -q "EMULATOR_RECLAIM: killed" "$TMP/guard.log" 2>/dev/null; then ok "logged the reclaim"; else bad "missing EMULATOR_RECLAIM log line"; fi
if grep -q "EMULATOR_RECLAIM: SKIP" "$TMP/guard.log" 2>/dev/null; then ok "logged the multi-agent SKIP"; else bad "missing EMULATOR_RECLAIM SKIP log line"; fi

kill -9 "$OWNER" 2>/dev/null
echo ""
printf "  %d passed, %d failed\n" "$pass" "$fail"
[ "$fail" -eq 0 ]
