#!/usr/bin/env bash
# Unit tests for scripts/hermes-fleet-gateway-probe.sh (no real SSH/network).
set -u

REPO="$(cd "$(dirname "$0")/.." && pwd)"
PROBE="$REPO/scripts/hermes-fleet-gateway-probe.sh"
TMP="$(mktemp -d "${TMPDIR:-/tmp}/fleet-probe-test.XXXXXX")"
trap 'rm -rf "$TMP"' EXIT INT TERM

pass=0; fail=0
G="\033[32m"; R="\033[31m"; Z="\033[0m"
ok()  { printf "  ${G}[PASS]${Z} %s\n" "$1"; pass=$((pass + 1)); }
bad() { printf "  ${R}[FAIL]${Z} %s\n" "$1"; fail=$((fail + 1)); }

BIN="$TMP/bin"; mkdir -p "$BIN"

cat > "$BIN/curl" <<'MOCK'
#!/usr/bin/env bash
url=""
for a in "$@"; do case "$a" in http://*|https://*) url="$a" ;; esac; done
case "$url" in
  *mini*) cat "$MOCK_MINI" 2>/dev/null || echo 000 ;;
  *mbp*)  cat "$MOCK_MBP" 2>/dev/null || echo 000 ;;
  *ntfy*) echo "NTFY $*" >> "$MOCK_CALLS" ;;
  *)      echo 000 ;;
esac
exit 0
MOCK
chmod +x "$BIN/curl"

run_probe() {
  : > "$TMP/calls"
  env \
    PATH="$BIN:$PATH" \
    HERMES_CURL_BIN="$BIN/curl" \
    HERMES_MINI_HEALTH_URL="http://mini/health" \
    HERMES_MBP_HEALTH_URL="http://mbp/health" \
    HERMES_FLEET_PROBE_LOG="$TMP/probe.log" \
    HERMES_FLEET_PROBE_STATE="$TMP/state" \
    HERMES_FLEET_PROBE_DRY_RUN="1" \
    HERMES_FLEET_HEAL_MINI="${HERMES_FLEET_HEAL_MINI:-1}" \
    HERMES_FLEET_HEAL_CMD="${HERMES_FLEET_HEAL_CMD:-}" \
    MOCK_MINI="$TMP/mini" \
    MOCK_MBP="$TMP/mbp" \
    MOCK_CALLS="$TMP/calls" \
    "$@" \
    bash "$PROBE"
  return $?
}

echo "=== hermes-fleet-gateway-probe unit tests ==="

if bash -n "$PROBE"; then ok "probe passes bash -n"; else bad "syntax"; fi

# Both healthy
echo 200 > "$TMP/mini"; echo 200 > "$TMP/mbp"
run_probe
[ "$(cat "$TMP/state")" = "ok" ] && ! grep -q NTFY "$TMP/calls" \
  && ok "T1: both healthy -> ok, silent" \
  || bad "T1: expected silent ok"

# Mini down first tick -> healing, heal invoked (dry), no ntfy yet
echo 000 > "$TMP/mini"; echo 200 > "$TMP/mbp"
: > "$TMP/state"
export HERMES_FLEET_HEAL_CMD='echo remote_health=000 >> "$MOCK_CALLS"'
run_probe; ec=$?
[ "$ec" -ne 0 ] && [ "$(cat "$TMP/state")" = "healing" ] && ! grep -q NTFY "$TMP/calls" \
  && ok "T2: first mini down -> healing, no alert" \
  || bad "T2: expected healing without ntfy (ec=$ec state=$(cat "$TMP/state"))"

# Still down second tick -> ntfy degraded (DRY mode logs DRY ntfy)
echo 000 > "$TMP/mini"
: > "$TMP/probe.log"
run_probe; ec=$?
if [ "$ec" -ne 0 ] && [ "$(cat "$TMP/state")" = "degraded" ] \
  && grep -q 'DRY ntfy title=Hermes fleet: mini gateway down' "$TMP/probe.log"; then
  ok "T3: second mini down -> degraded + ntfy"
else
  cat "$TMP/probe.log"; bad "T3: expected ntfy on second fail (ec=$ec)"
fi

# Recover
echo 200 > "$TMP/mini"
: > "$TMP/probe.log"
run_probe; ec=$?
if [ "$ec" -eq 0 ] && [ "$(cat "$TMP/state")" = "ok" ] \
  && grep -q 'DRY ntfy title=Hermes fleet: mini gateway recovered' "$TMP/probe.log"; then
  ok "T4: mini recover -> ok + recovery ntfy"
else
  cat "$TMP/probe.log"; bad "T4: recovery alert missing"
fi

# Heal path sets mini back to 200 mid-run (simulate successful SSH heal)
echo 000 > "$TMP/mini"; echo 200 > "$TMP/mbp"
: > "$TMP/state"
# HEAL_CMD rewrites mini mock to 200 before re-probe... probe heals then re-reads MOCK_MINI
export HERMES_FLEET_HEAL_CMD='echo 200 > "$MOCK_MINI"; echo HEALED >> "$MOCK_CALLS"'
run_probe; ec=$?
if [ "$ec" -eq 0 ] && [ "$(cat "$TMP/state")" = "ok" ] && grep -q HEALED "$TMP/calls"; then
  ok "T5: successful heal on first fail -> ok without degraded"
else
  cat "$TMP/calls"; bad "T5: heal did not restore ok (ec=$ec)"
fi

echo ""
echo "=== $pass passed, $fail failed ==="
[ "$fail" -eq 0 ]
