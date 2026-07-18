#!/usr/bin/env bash
# Tests for grok-yolo-leak-reaper.sh: etime parser + reap-by-age behavior against
# real stub processes (a long-sleeping "grok" vs a fresh one).
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
REAPER="$HERE/../scripts/grok-yolo-leak-reaper.sh"
pass=0; fail=0
ok(){ echo "  [PASS] $1"; pass=$((pass+1)); }
no(){ echo "  [FAIL] $1"; fail=$((fail+1)); }

# 1. etime parser correctness (extract the function, exercise it)
sed -n '/^etime_to_secs()/,/^}/p' "$REAPER" > /tmp/_etf.sh
source /tmp/_etf.sh
et(){ [ "$(etime_to_secs "$1")" = "$2" ] && ok "etime $1=$2" || no "etime $1 (got $(etime_to_secs "$1") want $2)"; }
et "05:30" 330
et "01:00:00" 3600
et "15:21:17" 55277
et "1-02:00:00" 93600
et "45" 45

# 2. dry run never kills, exits 0
"$REAPER" >/dev/null 2>&1 && ok "dry run exits 0" || no "dry run exit"

# 3. reap-by-age against real stubs: a fake "grok-0.2" that sleeps. We can't backdate a
#    process, so validate the AGE GATE by threshold: a just-started stub is "fresh" at
#    the default 4h, and reaped when the threshold is 0h. Use a pattern that matches the
#    stub's argv without matching this test.
STUB_TAG="grok-0.2-reaper-test-$$"
/bin/sh -c "exec -a $STUB_TAG sleep 60" &
stub_pid=$!
sleep 1
# fresh at 4h threshold -> kept
out="$(GROK_REAP_PATTERN="$STUB_TAG" "$REAPER" --apply 2>&1)"
if kill -0 "$stub_pid" 2>/dev/null && echo "$out" | grep -q "fresh"; then ok "fresh stub kept (age gate)"; else no "fresh stub kept ($out)"; fi
# threshold 0h -> reaped
GROK_REAP_MAX_HOURS=0 GROK_REAP_PATTERN="$STUB_TAG" "$REAPER" --apply >/dev/null 2>&1 || true
sleep 1
kill -0 "$stub_pid" 2>/dev/null && { no "0h threshold should reap"; kill "$stub_pid" 2>/dev/null; } || ok "0h threshold reaps stub"

echo "grok-reaper tests: $pass passed, $fail failed"
[ "$fail" -eq 0 ]
