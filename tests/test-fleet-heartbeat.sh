#!/usr/bin/env bash
# Hermetic tests for fleet-heartbeat.sh — launchctl and curl stubbed; no network.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
SCRIPT="$HERE/../scripts/fleet-heartbeat.sh"
ROOT="$(mktemp -d)"; trap 'rm -rf "$ROOT"' EXIT
pass=0; fail=0
ok(){ echo "  [PASS] $1"; pass=$((pass+1)); }
no(){ echo "  [FAIL] $1"; fail=$((fail+1)); }

export HERMES_ZERO_SPEND_MARKER="$ROOT/NO_PAID_SPEND"
export FLEET_HEARTBEAT_NTFY_TOPIC="test-topic"
export FLEET_GATEWAY_URL="http://127.0.0.1:4010/health"
export CURL_BIN="$ROOT/curl" LAUNCHCTL_BIN="$ROOT/launchctl"
export FLEET_WATCH_LABELS="com.igor.alpha com.igor.beta"
export FLEET_FRESH_LOGS=""

# curl stub: records notifications; health check succeeds unless $ROOT/gw_down exists
cat > "$ROOT/curl" <<EOF
#!/bin/sh
for a in "\$@"; do case "\$a" in *ntfy.sh*) printf '%s\n' "\$*" >> "$ROOT/notifications"; exit 0;; esac; done
[ -f "$ROOT/gw_down" ] && exit 7
exit 0
EOF
# launchctl stub: 'list' prints canned table from $ROOT/ll_table
cat > "$ROOT/launchctl" <<EOF
#!/bin/sh
[ "\$1" = list ] && { cat "$ROOT/ll_table" 2>/dev/null; exit 0; }
exit 0
EOF
chmod +x "$ROOT/curl" "$ROOT/launchctl"

# healthy baseline: both jobs present, exit 0, gateway up, zero-spend OFF
printf 'PID\tStatus\tLabel\n100\t0\tcom.igor.alpha\n200\t0\tcom.igor.beta\n' > "$ROOT/ll_table"

# 1: all clear -> exit 0, no notification, "staying silent"
out="$(bash "$SCRIPT")"; c=$?
{ [ "$c" = 0 ] && echo "$out" | grep -q "staying silent" && [ ! -f "$ROOT/notifications" ]; } \
  && ok "all-clear stays silent" || no "all-clear (c=$c, notif=$([ -f "$ROOT/notifications" ] && echo yes))"

# 2: a watched job MISSING -> notification fires
printf 'PID\tStatus\tLabel\n100\t0\tcom.igor.alpha\n' > "$ROOT/ll_table"
rm -f "$ROOT/notifications"; bash "$SCRIPT" >/dev/null
{ [ -f "$ROOT/notifications" ] && grep -q "com.igor.beta" "$ROOT/notifications" && grep -qi "MISSING" "$ROOT/notifications"; } \
  && ok "missing job -> ping" || no "missing job -> ping"

# 3: a watched job NOT running (no PID) with non-zero last exit -> notification fires
printf 'PID\tStatus\tLabel\n100\t0\tcom.igor.alpha\n-\t78\tcom.igor.beta\n' > "$ROOT/ll_table"
rm -f "$ROOT/notifications"; bash "$SCRIPT" >/dev/null
{ [ -f "$ROOT/notifications" ] && grep -q "exit=78" "$ROOT/notifications"; } \
  && ok "not-running + failed exit -> ping" || no "not-running + failed exit -> ping"

# 3b: a RUNNING job (live PID) with a stale non-zero last exit is NOT a concern
#     (mirrors real hermes-litellm: PID present, Status -15 from a prior restart)
printf 'PID\tStatus\tLabel\n100\t0\tcom.igor.alpha\n64496\t-15\tcom.igor.beta\n' > "$ROOT/ll_table"
rm -f "$ROOT/notifications"; out="$(bash "$SCRIPT")"
{ echo "$out" | grep -q "staying silent" && [ ! -f "$ROOT/notifications" ]; } \
  && ok "running job w/ stale last-exit is not a concern" || no "running + stale last-exit handling"

# 4: job that never ran ("-" status, no PID) is NOT a concern
printf 'PID\tStatus\tLabel\n100\t0\tcom.igor.alpha\n-\t-\tcom.igor.beta\n' > "$ROOT/ll_table"
rm -f "$ROOT/notifications"; out="$(bash "$SCRIPT")"
{ echo "$out" | grep -q "staying silent" && [ ! -f "$ROOT/notifications" ]; } \
  && ok "never-ran job is not a concern" || no "never-ran job handling"

# 5: gateway DOWN while paid spend ENABLED -> concern
printf 'PID\tStatus\tLabel\n100\t0\tcom.igor.alpha\n200\t0\tcom.igor.beta\n' > "$ROOT/ll_table"
touch "$ROOT/gw_down"; rm -f "$ROOT/notifications"; bash "$SCRIPT" >/dev/null
{ [ -f "$ROOT/notifications" ] && grep -qi "gateway" "$ROOT/notifications"; } \
  && ok "gateway down + paid -> ping" || no "gateway down + paid -> ping"

# 6: gateway DOWN but zero-spend ON -> NOT a concern (no paid route expected)
: > "$ROOT/NO_PAID_SPEND"; rm -f "$ROOT/notifications"; out="$(bash "$SCRIPT")"
{ echo "$out" | grep -q "staying silent" && [ ! -f "$ROOT/notifications" ]; } \
  && ok "gateway down but zero-spend -> silent" || no "gateway down + zero-spend handling"
rm -f "$ROOT/NO_PAID_SPEND" "$ROOT/gw_down"

# 7: stale log -> concern; fresh log -> silent
printf 'PID\tStatus\tLabel\n100\t0\tcom.igor.alpha\n200\t0\tcom.igor.beta\n' > "$ROOT/ll_table"
oldlog="$ROOT/old.log"; : > "$oldlog"; /usr/bin/touch -t 202601010000 "$oldlog"
export FLEET_FRESH_LOGS="testsentinel:$oldlog:3600"
rm -f "$ROOT/notifications"; bash "$SCRIPT" >/dev/null
{ [ -f "$ROOT/notifications" ] && grep -qi "stale" "$ROOT/notifications"; } \
  && ok "stale log -> ping" || no "stale log -> ping"
freshlog="$ROOT/fresh.log"; : > "$freshlog"
export FLEET_FRESH_LOGS="testsentinel:$freshlog:3600"
rm -f "$ROOT/notifications"; out="$(bash "$SCRIPT")"
{ echo "$out" | grep -q "staying silent" && [ ! -f "$ROOT/notifications" ]; } \
  && ok "fresh log -> silent" || no "fresh log -> silent"
export FLEET_FRESH_LOGS=""

echo "fleet-heartbeat tests: $pass passed, $fail failed"
[ "$fail" -eq 0 ]
