#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SCRIPT="$ROOT/scripts/configure-browser-efficiency.sh"
TMP="$(mktemp -d /tmp/browser-efficiency-test.XXXXXX)"
trap 'rm -rf "$TMP"' EXIT

pass=0
fail=0
ok() { printf '  ok - %s\n' "$1"; pass=$((pass + 1)); }
bad() { printf '  not ok - %s\n' "$1"; fail=$((fail + 1)); }
json_assert() {
  local payload="$1"
  local expression="$2"
  local label="$3"
  if printf '%s' "$payload" | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const x=JSON.parse(s);process.exit(($expression)?0:1)})"; then
    ok "$label"
  else
    bad "$label"
  fi
}

mkdir -p "$TMP/bin" "$TMP/Google Chrome.app"
printf 'unset\n' > "$TMP/state"

cat > "$TMP/bin/defaults" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
if [[ "$1" == "read" ]]; then
  value="$(cat "$BROWSER_EFFICIENCY_TEST_STATE")"
  [[ "$value" != "unset" ]] || exit 1
  printf '%s\n' "$value"
elif [[ "$1" == "write" ]]; then
  printf '0\n' > "$BROWSER_EFFICIENCY_TEST_STATE"
else
  exit 64
fi
EOF

cat > "$TMP/bin/pgrep" <<'EOF'
#!/usr/bin/env bash
printf '101\n102\n'
EOF

cat > "$TMP/bin/curl" <<'EOF'
#!/usr/bin/env bash
case "$*" in
  *:9222/*) exit 0 ;;
  *) exit 1 ;;
esac
EOF

cat > "$TMP/bin/ssh" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
last="${!#}"
exec /bin/bash -s -- "$last"
EOF

chmod +x "$TMP/bin/"*

export BROWSER_EFFICIENCY_TEST_STATE="$TMP/state"
export BROWSER_EFFICIENCY_DEFAULTS_BIN="$TMP/bin/defaults"
export BROWSER_EFFICIENCY_PGREP_BIN="$TMP/bin/pgrep"
export BROWSER_EFFICIENCY_CURL_BIN="$TMP/bin/curl"
export BROWSER_EFFICIENCY_SSH_BIN="$TMP/bin/ssh"
export BROWSER_EFFICIENCY_CHROME_APP="$TMP/Google Chrome.app"

status_json="$($SCRIPT --status --json)"
json_assert "$status_json" 'x.backgroundModeAfter==="unset"&&x.chromeRootProcesses===2&&x.cdp["9222"]==="ok"&&x.cdp["9223"]==="down"' "status emits valid, bounded JSON"

apply_json="$($SCRIPT --apply --json)"
if [[ "$(cat "$TMP/state")" == 0 ]]; then ok "apply writes BackgroundModeEnabled=false"; else bad "apply writes BackgroundModeEnabled=false"; fi
json_assert "$apply_json" 'x.backgroundModeBefore==="unset"&&x.backgroundModeAfter==="0"&&x.processesTerminated===0&&x.profilesInspected===0' "apply reports before/after and zero destructive actions"

second_json="$($SCRIPT --apply --json)"
json_assert "$second_json" 'x.backgroundModeBefore==="0"&&x.backgroundModeAfter==="0"' "apply is idempotent"

remote_json="$($SCRIPT --apply --host hermes-mini --json)"
json_assert "$remote_json" 'x.target==="hermes-mini"&&x.backgroundModeAfter==="0"' "explicit SSH host uses the same safe contract"

if $SCRIPT --status --host 'bad;host' >/dev/null 2>&1; then
  bad "unsafe SSH host is rejected"
else
  ok "unsafe SSH host is rejected"
fi

if rg -n '\b(pkill|killall|kill)[[:space:]]' "$SCRIPT" >/dev/null; then
  bad "script contains a process termination command"
else
  ok "script contains no process termination command"
fi

if rg -n 'Application Support|/Profiles?|/Extensions?|Cookies?' "$SCRIPT" >/dev/null; then
  bad "script inspects browser-private storage"
else
  ok "script does not inspect browser-private storage"
fi

printf '\nPASS %s/%s browser-efficiency checks\n' "$pass" "$((pass + fail))"
[[ "$fail" -eq 0 ]]
