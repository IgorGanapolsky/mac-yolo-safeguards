#!/bin/sh
# The aggregate Chrome banner and the CPU "inspect" banner are log-only.
# Their titles include a live number, so debounce never collapsed them.
set -u

REPO="$(cd "$(dirname "$0")/.." && pwd)"
GUARD="$REPO/sim-runaway-guard.sh"
TMP="$(mktemp -d /tmp/yolo-banner-quiet.XXXXXX)"
trap 'rm -rf "$TMP"' EXIT

mkdir -p "$TMP/bin" "$TMP/home"
cat > "$TMP/bin/terminal-notifier" << 'EOF'
#!/bin/sh
echo "called" >> "$TN_LOG"
exit 0
EOF
chmod 755 "$TMP/bin/terminal-notifier"

run_title() {
  title="$1"
  : > "$TMP/log"
  rm -f "$TMP/tn"
  TN_LOG="$TMP/tn" \
  YOLO_LOG="$TMP/log" \
  TMPDIR="$TMP" \
  HOME="$TMP/home" \
  PATH="$TMP/bin:$PATH" \
  YOLO_BYPASS_E2E_LEASE=1 \
  YOLO_GUARD_NOTIFY_SELFTEST=1 \
  YOLO_GUARD_NOTIFY_SELFTEST_TITLE="$title" \
  YOLO_GUARD_NOTIFY_SELFTEST_MSG="selftest" \
    "$GUARD" >/dev/null 2>&1
}

fail() { echo "FAIL: $1" >&2; exit 1; }

run_title "yolo-guard: Chrome 3332MB across 33 procs"
grep -q "NOTIFY(log-only,routine): yolo-guard: Chrome 3332MB across 33 procs" "$TMP/log" \
  || fail "chrome aggregate banner was not log-only"
[ ! -f "$TMP/tn" ] || fail "chrome aggregate banner called terminal-notifier"

run_title "yolo-guard: inspect ccusage 400% CPU"
grep -q "NOTIFY(log-only,routine): yolo-guard: inspect ccusage 400% CPU" "$TMP/log" \
  || fail "cpu inspect banner was not log-only"
[ ! -f "$TMP/tn" ] || fail "cpu inspect banner called terminal-notifier"

run_title "yolo-guard fired"
grep -q "NOTIFY: yolo-guard fired" "$TMP/log" || fail "a real fire did not notify"
[ -f "$TMP/tn" ] || fail "a real fire did not call terminal-notifier"

echo "test-yolo-guard-banner-quiet: PASS"
