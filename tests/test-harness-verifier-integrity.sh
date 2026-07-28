#!/usr/bin/env bash
# test-harness-verifier-integrity - do our test suites actually DETECT the bugs they
# claim to guard against?
#
# Why this exists (2026-07-27/28):
#   `tests/test-poolside-yolo.sh` asserted `--mode allow-all` — a mode pool does not
#   have. pool silently fell back to "Always ask", so poolside-yolo prompted for every
#   tool while advertising autonomy, and the suite stayed GREEN for days. A verifier
#   that passes against the broken build is not a verifier.
#   The same session produced five more "measured nothing, reported clean" results:
#   a failed `mapfile` searching 0 files, `log show` returning 0 lines because it is
#   blocked, a glob that errored, a suppressed `ls`, and 0-pending CI read as settled.
#
# So this suite does two things no ordinary test does:
#   1. MUTATION CONTROL — reintroduce the exact historical bug into a throwaway copy
#      and assert the suite goes RED. If it stays green, the suite is decorative.
#   2. VACUITY GUARD — assert each mutant run actually executed assertions. A suite
#      that fails because it crashed on line 1 "detects" nothing.
#
# Everything runs in temp copies; the repo's real files are never modified.
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
REPO="$(cd "$HERE/.." && pwd)"
ROOT="$(mktemp -d)"
trap 'rm -rf "$ROOT"' EXIT
pass=0; fail=0
ok() { echo "  [PASS] $1"; pass=$((pass+1)); }
no() { echo "  [FAIL] $1"; fail=$((fail+1)); }

# Stage a throwaway copy of the harness: <dir>/<subject> plus <dir>/tests/<suite>.
stage() { # $1=dir $2=subject-relpath $3=suite-relpath
  mkdir -p "$1/$(dirname "$2")" "$1/$(dirname "$3")"
  cp "$REPO/$2" "$1/$2"; cp "$REPO/$3" "$1/$3"
  chmod +x "$1/$2" "$1/$3"
}

# Run a staged suite; echo "<exit>|<assertions-executed>".
run_suite() { # $1=dir $2=suite-relpath
  local out rc
  out="$(cd "$1" && bash "$2" 2>&1)" && rc=0 || rc=$?
  printf '%s|%s\n' "$rc" "$(printf '%s\n' "$out" | grep -c '\[PASS\]\|\[FAIL\]' || true)"
}

echo "== poolside-yolo: does the suite detect the real 2026-07-27 autonomy bug? =="

# Baseline: unmutated copy must PASS (otherwise a red mutant proves nothing).
BASE="$ROOT/base"; stage "$BASE" "poolside-yolo" "tests/test-poolside-yolo.sh"
IFS='|' read -r brc bn <<< "$(run_suite "$BASE" "tests/test-poolside-yolo.sh")"
if [ "$brc" -eq 0 ] && [ "${bn:-0}" -ge 10 ]; then
  ok "baseline suite passes and executed $bn assertions"
else
  no "baseline suite must pass with real assertions (exit=$brc assertions=${bn:-0})"
fi

# Mutant: put back the exact broken string that shipped. The suite MUST go red.
MUT="$ROOT/mut"; stage "$MUT" "poolside-yolo" "tests/test-poolside-yolo.sh"
# Reintroduce the historical bug: the autonomy mode becomes a mode pool does not have.
# python3, not `sed -i ''` — that form is BSD-only and would silently no-op elsewhere,
# which would make every assertion below vacuous.
python3 - "$MUT/poolside-yolo" <<'PY'
import sys
p = sys.argv[1]; s = open(p).read()
for a, b in (('YOLO_MODE="${POOLSIDE_YOLO_MODE:-always-allow}"',
              'YOLO_MODE="${POOLSIDE_YOLO_MODE:-allow-all}"'),
             ('KNOWN_MODES="default accept-edits plan always-allow"',
              'KNOWN_MODES="default accept-edits plan allow-all"')):
    assert a in s, f"mutation anchor not found: {a}"
    s = s.replace(a, b, 1)
open(p, "w").write(s)
PY
grep -q 'POOLSIDE_YOLO_MODE:-allow-all' "$MUT/poolside-yolo" \
  && ok "mutation applied (autonomy mode reverted to the broken 'allow-all')" \
  || no "mutation did not apply — the rest of this suite would be vacuous"

IFS='|' read -r mrc mn <<< "$(run_suite "$MUT" "tests/test-poolside-yolo.sh")"
if [ "${mn:-0}" -lt 10 ]; then
  no "mutant run executed only ${mn:-0} assertions — it crashed rather than detected (vacuous)"
elif [ "$mrc" -ne 0 ]; then
  ok "suite DETECTS the reverted autonomy bug (exit=$mrc, $mn assertions ran)"
else
  no "suite stayed GREEN against the known-broken build — it is decorative"
fi

echo "== route-recovery: does the suite detect a gate that restarts too eagerly? =="

RBASE="$ROOT/rbase"
stage "$RBASE" "scripts/hermes-primary-route-recovery.sh" "tests/test-hermes-primary-route-recovery.sh"
IFS='|' read -r rbrc rbn <<< "$(run_suite "$RBASE" "tests/test-hermes-primary-route-recovery.sh")"
if [ "$rbrc" -eq 0 ] && [ "${rbn:-0}" -ge 5 ]; then
  ok "baseline recovery suite passes and executed $rbn assertions"
else
  no "baseline recovery suite must pass with real assertions (exit=$rbrc assertions=${rbn:-0})"
fi

# Mutant: delete the "upstream quota has not reopened yet" guard, so it would restart
# the proxy while the upstream is still legitimately exhausted.
RMUT="$ROOT/rmut"
stage "$RMUT" "scripts/hermes-primary-route-recovery.sh" "tests/test-hermes-primary-route-recovery.sh"
python3 - "$RMUT/scripts/hermes-primary-route-recovery.sh" <<'PY'
import sys, re
p = sys.argv[1]; s = open(p).read()
# neutralise the future-reset gate: `if (( now < reset_at ))` never fires
s2 = s.replace("if (( now < reset_at )); then", "if false; then", 1)
assert s2 != s, "mutation anchor not found"
open(p, "w").write(s2)
PY
grep -q "if false; then" "$RMUT/scripts/hermes-primary-route-recovery.sh" \
  && ok "mutation applied (future-reset gate disabled)" \
  || no "mutation did not apply — next assertion would be vacuous"

IFS='|' read -r rmrc rmn <<< "$(run_suite "$RMUT" "tests/test-hermes-primary-route-recovery.sh")"
if [ "${rmn:-0}" -lt 5 ]; then
  no "mutant recovery run executed only ${rmn:-0} assertions — crashed, did not detect (vacuous)"
elif [ "$rmrc" -ne 0 ]; then
  ok "suite DETECTS a recovery gate that would restart during a live quota window ($rmn assertions ran)"
else
  no "recovery suite stayed GREEN with its safety gate removed — it is decorative"
fi

echo "harness verifier integrity: $pass passed, $fail failed"
[ "$fail" -eq 0 ]
