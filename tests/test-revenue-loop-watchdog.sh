#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TMP="$(mktemp -d "${TMPDIR:-/tmp}/revenue-loop-watchdog-test.XXXXXX")"
trap 'rm -rf -- "$TMP"' EXIT

LAUNCH_DIR="$TMP/LaunchAgents"
LOGS_DIR="$TMP/logs"
GOOD_WD="$TMP/good-worktree"
mkdir -p "$LAUNCH_DIR" "$LOGS_DIR" "$GOOD_WD"

FAKE_CURL="$TMP/fake-curl"
cat >"$FAKE_CURL" <<'FAKE'
#!/usr/bin/env bash
printf '%s\n' "$*" >>"${FAKE_CURL_LOG:?}"
exit 0
FAKE
chmod 700 "$FAKE_CURL"

FAKE_LAUNCHCTL="$TMP/fake-launchctl"
cat >"$FAKE_LAUNCHCTL" <<'FAKE'
#!/usr/bin/env bash
# usage: fake-launchctl print gui/<uid>/<label>
label="${3##*/}"
mode="${FAKE_LAUNCHCTL_MODE:-healthy}"
case "$mode" in
  not-loaded)
    exit 1
    ;;
  bad-exit)
    printf '%s {\n\tstate = not running\n\tworking directory = /tmp\n\tlast exit code = 78\n}\n' "$label"
    ;;
  *)
    printf '%s {\n\tstate = not running\n\tworking directory = /tmp\n\tlast exit code = 0\n}\n' "$label"
    ;;
esac
FAKE
chmod 700 "$FAKE_LAUNCHCTL"

write_plist() {
  local label="$1" working_dir="$2" start_interval="$3"
  local out_log="$LOGS_DIR/$label.out.log"
  local err_log="$LOGS_DIR/$label.err.log"
  cat >"$LAUNCH_DIR/$label.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>$label</string>
    <key>WorkingDirectory</key>
    <string>$working_dir</string>
    <key>StartInterval</key>
    <integer>$start_interval</integer>
    <key>StandardOutPath</key>
    <string>$out_log</string>
    <key>StandardErrorPath</key>
    <string>$err_log</string>
</dict>
</plist>
PLIST
}

run_watchdog() {
  REVENUE_WATCHDOG_LAUNCH_AGENTS_DIR="$LAUNCH_DIR" \
  REVENUE_WATCHDOG_LAUNCHCTL_BIN="$FAKE_LAUNCHCTL" \
  REVENUE_WATCHDOG_CURL_BIN="$FAKE_CURL" \
  REVENUE_WATCHDOG_JOBS="com.igor.revenue-autonomous-loop com.igor.ralph-gsd-loop" \
  REVENUE_WATCHDOG_STATE="$TMP/state" \
  REVENUE_WATCHDOG_LOG="$TMP/status.jsonl" \
  REVENUE_WATCHDOG_GUI_DOMAIN="gui/501" \
  FAKE_CURL_LOG="$TMP/curl.log" \
  FAKE_LAUNCHCTL_MODE="${1:-healthy}" \
  bash "$ROOT/scripts/revenue-loop-watchdog.sh"
}

freshen_logs() {
  touch "$LOGS_DIR/com.igor.revenue-autonomous-loop.out.log" \
        "$LOGS_DIR/com.igor.ralph-gsd-loop.out.log"
}

stale_logs() {
  touch "$LOGS_DIR/com.igor.revenue-autonomous-loop.out.log" \
        "$LOGS_DIR/com.igor.ralph-gsd-loop.out.log"
  # -A shifts mtime back by the given [hh]mmss delta from its just-set value —
  # 10 hours comfortably exceeds both jobs' 2x-StartInterval thresholds
  # (28800s for the 4h loop, 3600s for the 30m loop).
  touch -A -100000 "$LOGS_DIR/com.igor.revenue-autonomous-loop.out.log" \
                    "$LOGS_DIR/com.igor.ralph-gsd-loop.out.log"
}

pass=0; fail=0
ok() { printf '  [PASS] %s\n' "$1"; pass=$((pass + 1)); }
bad() { printf '  [FAIL] %s\n' "$1"; fail=$((fail + 1)); exit 1; }

# --- Case 1: healthy jobs (fresh logs, working dir exists, exit 0) ---
write_plist com.igor.revenue-autonomous-loop "$GOOD_WD" 14400
write_plist com.igor.ralph-gsd-loop "$GOOD_WD" 1800
freshen_logs

if run_watchdog healthy >"$TMP/out1.log" 2>&1; then
  ok "healthy jobs exit 0"
else
  cat "$TMP/out1.log"
  bad "healthy jobs should exit 0"
fi
grep -q '"status":"ok"' "$TMP/status.jsonl" && ok "healthy status logged as ok" || bad "expected ok status in log"
grep -q '^ok$' "$TMP/state" && ok "state file records ok" || bad "expected ok in state file"
[ ! -s "$TMP/curl.log" ] && ok "no ntfy alert fired while healthy from start" || bad "unexpected ntfy call on first healthy run"

# --- Case 2: broken WorkingDirectory (the real incident) ---
BROKEN_WD="$TMP/deleted-worktree-does-not-exist"
write_plist com.igor.revenue-autonomous-loop "$BROKEN_WD" 14400
if run_watchdog healthy >"$TMP/out2.log" 2>&1; then
  bad "broken WorkingDirectory should cause non-zero exit"
else
  ok "broken WorkingDirectory causes non-zero exit"
fi
grep -q 'WorkingDirectory does not exist' "$TMP/out2.log" && ok "concern names missing WorkingDirectory" || bad "expected WorkingDirectory concern in output"
grep -q '"status":"degraded"' "$TMP/status.jsonl" && ok "degraded status logged" || bad "expected degraded status in log"
grep -q 'Title: Revenue loop watchdog degraded' "$TMP/curl.log" && ok "ntfy alert fired on ok->degraded transition" || bad "expected ntfy alert on transition"

# Re-running while still degraded must not re-alert (edge-triggered only).
: > "$TMP/curl.log"
run_watchdog healthy >/dev/null 2>&1 || true
[ ! -s "$TMP/curl.log" ] && ok "no duplicate ntfy alert while still degraded" || bad "unexpected repeat ntfy alert"

# --- Case 3: restore WorkingDirectory -> recovery ---
write_plist com.igor.revenue-autonomous-loop "$GOOD_WD" 14400
: > "$TMP/curl.log"
if run_watchdog healthy >"$TMP/out3.log" 2>&1; then
  ok "restored WorkingDirectory -> exit 0"
else
  cat "$TMP/out3.log"
  bad "restored WorkingDirectory should exit 0"
fi
grep -q '"status":"ok"' "$TMP/status.jsonl" && ok "recovery status logged as ok" || bad "expected ok status after recovery"
grep -q 'Title: Revenue loop watchdog recovered' "$TMP/curl.log" && ok "ntfy recovery alert fired on degraded->ok transition" || bad "expected ntfy recovery alert"

# --- Case 4: non-zero LastExitStatus alone (WorkingDirectory fine) ---
: > "$TMP/curl.log"
if run_watchdog bad-exit >"$TMP/out4.log" 2>&1; then
  bad "non-zero last exit code should cause non-zero exit"
else
  ok "non-zero LastExitStatus causes non-zero exit"
fi
grep -q 'last exit code 78' "$TMP/out4.log" && ok "concern names the bad exit code" || bad "expected last-exit-code concern"

# --- Case 5: stale stdout/stderr (job loaded, dir fine, exit 0, but no recent log write) ---
: > "$TMP/curl.log"
stale_logs
if run_watchdog healthy >"$TMP/out5.log" 2>&1; then
  bad "stale log output should cause non-zero exit"
else
  ok "stale log output causes non-zero exit"
fi
grep -q 'stale output' "$TMP/out5.log" && ok "concern names stale output" || bad "expected stale-output concern"

# --- Case 6: job not loaded in launchd at all ---
: > "$TMP/curl.log"
if run_watchdog not-loaded >"$TMP/out6.log" 2>&1; then
  bad "unloaded job should cause non-zero exit"
else
  ok "unloaded job causes non-zero exit"
fi
grep -q 'launchd job not loaded' "$TMP/out6.log" && ok "concern names the unloaded job" || bad "expected not-loaded concern"

echo ""
echo "revenue-loop-watchdog tests: $pass passed, $fail failed"
[ "$fail" -eq 0 ]
