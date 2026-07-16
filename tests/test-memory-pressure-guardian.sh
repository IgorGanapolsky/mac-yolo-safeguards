#!/usr/bin/env bash
# Isolated decision tests for the kernel-pressure Ollama unload/cooldown path.
set -u

REPO="$(cd "$(dirname "$0")/.." && pwd)"
GUARD="$REPO/scripts/memory-pressure-guardian.sh"
TMP="$(mktemp -d "${TMPDIR:-/tmp}/memory-guardian-test.XXXXXX")"
trap 'rm -rf "$TMP"' EXIT INT TERM

pass=0; fail=0
ok() { printf '  [PASS] %s\n' "$1"; pass=$((pass + 1)); }
bad() { printf '  [FAIL] %s\n' "$1"; fail=$((fail + 1)); }

mkdir -p "$TMP/bin"
cat > "$TMP/bin/sysctl" <<'MOCK'
#!/bin/sh
case "$*" in
  *kern.memorystatus_vm_pressure_level*) echo "${MOCK_PRESSURE:-1}" ;;
  *vm.swapusage*) echo 'total = 1024.00M used = 512.00M free = 512.00M' ;;
esac
MOCK
cat > "$TMP/bin/date" <<'MOCK'
#!/bin/sh
if [ "${1:-}" = "+%s" ]; then echo "${MOCK_NOW:-1000}"; else echo '2026-07-16 10:00:00'; fi
MOCK
cat > "$TMP/bin/sleep" <<'MOCK'
#!/bin/sh
exit 0
MOCK
cat > "$TMP/bin/curl" <<'MOCK'
#!/bin/sh
url=""; payload=""
while [ "$#" -gt 0 ]; do
  case "$1" in
    http://*|https://*) url="$1" ;;
    -d) shift; payload="${1:-}" ;;
  esac
  shift
done
case "$url" in
  */api/ps)
    if [ -n "${MOCK_OLLAMA_PS:-}" ]; then printf '%s' "$MOCK_OLLAMA_PS"; else printf '%s' '{"models":[]}'; fi
    ;;
  */api/generate)
    printf 'UNLOAD %s\n' "$payload" >> "$MOCK_CALLS"
    printf '%s' "${MOCK_UNLOAD_STATUS:-200}"
    ;;
  https://ntfy.sh/*) printf 'NOTIFY\n' >> "$MOCK_CALLS" ;;
esac
MOCK
chmod +x "$TMP/bin/"*

reset_state() {
  rm -f "$TMP/streak" "$TMP/warn" "$TMP/crit" "$TMP/recovery"
  : > "$TMP/calls"
  : > "$TMP/guard.log"
}

run_guard() {
  dry=""
  if [ "${1:-}" = "--dry-run" ]; then dry="$1"; shift; fi
  env \
    MEMORY_GUARD_LOG="$TMP/guard.log" \
    MEMORY_GUARD_STREAK_FILE="$TMP/streak" \
    MEMORY_GUARD_WARN_FILE="$TMP/warn" \
    MEMORY_GUARD_CRIT_FILE="$TMP/crit" \
    YOLO_MEMORY_RECOVERY_FILE="$TMP/recovery" \
    MEMORY_GUARD_STREAK_REQUIRED="1" \
    MEMORY_GUARD_WARN_COOLDOWN="0" \
    YOLO_MEMORY_RECOVERY_SEC="600" \
    MEMORY_GUARD_SYSCTL_BIN="$TMP/bin/sysctl" \
    MEMORY_GUARD_DATE_BIN="$TMP/bin/date" \
    MEMORY_GUARD_SLEEP_BIN="$TMP/bin/sleep" \
    MEMORY_GUARD_CURL_BIN="$TMP/bin/curl" \
    MOCK_CALLS="$TMP/calls" \
    MOCK_NOW="1000" \
    "$@" \
    bash "$GUARD" "$dry"
}

echo '=== memory-pressure-guardian tests ==='
if bash -n "$GUARD"; then ok "guardian syntax is valid"; else bad "guardian syntax is invalid"; fi

reset_state
run_guard MOCK_PRESSURE="1" MOCK_OLLAMA_PS='{"models":[{"name":"qwen-test"}]}'
if [ ! -s "$TMP/calls" ] && [ ! -e "$TMP/recovery" ]; then
  ok "normal kernel pressure performs no unload"
else
  bad "normal pressure triggered recovery activity"
fi

reset_state
run_guard MOCK_PRESSURE="2" MOCK_OLLAMA_PS='{"models":[{"name":"qwen-test"}]}'
if grep -q 'UNLOAD.*"keep_alive":0' "$TMP/calls" && [ "$(cat "$TMP/recovery" 2>/dev/null)" = "1600" ]; then
  ok "WARN unloads through HTTP and publishes a 600s shared cooldown"
else
  bad "WARN did not unload through HTTP or write the cooldown"
fi
if ! rg -q 'pkill.*(llama|ollama)|kill .*llama' "$GUARD"; then
  ok "guardian contains no Ollama/llama hard-kill path"
else
  bad "guardian still contains an Ollama hard-kill path"
fi

reset_state
run_guard --dry-run MOCK_PRESSURE="2" MOCK_OLLAMA_PS='{"models":[{"name":"qwen-test"}]}'
if ! grep -q '^UNLOAD ' "$TMP/calls" && [ ! -e "$TMP/recovery" ]; then
  ok "dry-run reports but does not unload or create recovery state"
else
  bad "dry-run changed Ollama or recovery state"
fi

reset_state
run_guard MOCK_PRESSURE="2" MOCK_OLLAMA_PS='{"models":[{"name":"qwen-test"}]}' MOCK_UNLOAD_STATUS="500"
if grep -q '^UNLOAD ' "$TMP/calls" && [ ! -e "$TMP/recovery" ] && [ ! -e "$TMP/warn" ] \
  && grep -q 'HTTP unload failed' "$TMP/guard.log"; then
  ok "failed HTTP unload is reported and remains eligible for next-poll retry"
else
  bad "failed unload was not represented honestly"
fi

echo
echo "=== $pass passed, $fail failed ==="
[ "$fail" -eq 0 ]
