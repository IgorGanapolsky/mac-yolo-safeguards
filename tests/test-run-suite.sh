#!/usr/bin/env bash
# Tests for run-suite: the gate that stops a suite from reporting "clean" when it
# actually measured nothing. Its three exit codes are the contract —
#   0 = verified clean, 1 = real failure, 2 = could not evaluate
# — because collapsing 2 into 0 hides real problems and collapsing it into 1 cries wolf.
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
RUNNER="$HERE/run-suite.sh"
ROOT="$(mktemp -d)"
trap 'rm -rf "$ROOT"' EXIT
pass=0; fail=0
ok() { echo "  [PASS] $1"; pass=$((pass+1)); }
no() { echo "  [FAIL] $1"; fail=$((fail+1)); }

rc_of() { set +e; "$RUNNER" "$@" >/dev/null 2>&1; local r=$?; set -e; printf '%s' "$r"; }

# a suite that really asserts things
cat > "$ROOT/good.sh" <<'EOF'
#!/usr/bin/env bash
echo "  [PASS] a"; echo "  [PASS] b"; echo "  [PASS] c"
EOF
# a suite that exits 0 having asserted nothing — the 2026-07-27 pattern
cat > "$ROOT/vacuous.sh" <<'EOF'
#!/usr/bin/env bash
fail=0
[ "$fail" -eq 0 ]
EOF
# a suite that genuinely fails
cat > "$ROOT/failing.sh" <<'EOF'
#!/usr/bin/env bash
echo "  [FAIL] boom"; exit 1
EOF
# a suite that crashes before asserting anything (exit != 0, 0 assertions)
cat > "$ROOT/crash.sh" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
mapfile -t X < <(echo hi)   # not a zsh/bash-3 builtin everywhere; may explode
exit 3
EOF
chmod +x "$ROOT"/*.sh

[ "$(rc_of "$ROOT/good.sh")" = "0" ] && ok "real suite -> 0 (verified clean)" || no "real suite -> 0"
[ "$(rc_of "$ROOT/vacuous.sh")" = "2" ] && ok "exits 0 but asserts nothing -> 2 (could not evaluate)" || no "vacuous -> 2"
[ "$(rc_of "$ROOT/failing.sh")" = "1" ] && ok "genuine failure -> 1 (distinct from vacuous)" || no "failing -> 1"
[ "$(rc_of "$ROOT/crash.sh")" = "1" ] && ok "crash -> 1, never 0" || no "crash -> 1"
[ "$(rc_of "$ROOT/nope.sh")" = "2" ] && ok "missing suite -> 2, never treated as passing" || no "missing suite -> 2"

# the min-assertions floor: a suite that shrinks silently must not pass
[ "$(rc_of "$ROOT/good.sh" 3)" = "0" ] && ok "meets min-assertions floor -> 0" || no "min floor met -> 0"
[ "$(rc_of "$ROOT/good.sh" 99)" = "2" ] && ok "below min-assertions floor -> 2 (suite silently shrank)" || no "below min floor -> 2"

echo "run-suite tests: $pass passed, $fail failed"
[ "$pass" -ge 7 ] || { echo "VACUOUS: expected >= 7 assertions, ran $pass" >&2; exit 2; }
[ "$fail" -eq 0 ]
