#!/usr/bin/env bash
# Contract tests for Hermes Chrome CDP heal (no live Chrome required).
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
chrome="${repo_root}/scripts/hermes-chrome-cdp.sh"
install="${repo_root}/scripts/install-hermes-chrome-cdp.sh"
configure="${repo_root}/scripts/configure-browser-control.sh"
plist="${repo_root}/com.hermes.chrome-cdp.plist"
docs="${repo_root}/docs/BROWSER-CONTROL.md"
fail=0

ok() { echo "ok $*"; }
bad() { echo "FAIL $*"; fail=$((fail + 1)); }

[[ -x "$chrome" ]] || bad "hermes-chrome-cdp.sh missing/executable"
[[ -x "$install" ]] || bad "install-hermes-chrome-cdp.sh missing/executable"
[[ -x "$configure" ]] || bad "configure-browser-control.sh missing/executable"
[[ -f "$plist" ]] || bad "com.hermes.chrome-cdp.plist missing"
[[ -f "$docs" ]] || bad "docs/BROWSER-CONTROL.md missing"

body="$(cat "$chrome")"
grep -q 'remote-debugging-address' <<<"$body" || bad "chrome script must bind remote-debugging-address"
grep -q 'reclaim_non_cdp_squat\|CDP squat reclaim' <<<"$body" || bad "chrome script must reclaim non-CDP squats"
grep -q 'webSocketDebuggerUrl' <<<"$body" || bad "chrome script must validate CDP JSON"
grep -q '::1\|cdp_ok_ipv4' <<<"$body" || bad "chrome script must distinguish IPv4 vs IPv6 CDP"
grep -q 'chrome-cdp-profile' <<<"$body" || bad "chrome script must scope kills to hermes profile"

plist_body="$(cat "$plist")"
grep -q 'HERMES_CDP_BIND' <<<"$plist_body" || bad "plist must set HERMES_CDP_BIND"
grep -q 'HERMES_CDP_RECLAIM_SQUAT' <<<"$plist_body" || bad "plist must set HERMES_CDP_RECLAIM_SQUAT"

cfg="$(cat "$configure")"
grep -q 'Browser Automation' <<<"$cfg" || bad "configure script must mention Browser Automation"
grep -q 'no adb' <<<"$cfg" || bad "configure script must state no adb path"

docs_body="$(cat "$docs")"
grep -q 'com.hermes.chrome-cdp' <<<"$docs_body" || bad "docs must name LaunchAgent"
grep -q 'Hermes Mobile' <<<"$docs_body" || bad "docs must cover mobile enable path"
grep -q 'Kimi WebBridge' <<<"$docs_body" || bad "docs must record WebBridge gaps"

# Syntax
bash -n "$chrome" || bad "bash -n hermes-chrome-cdp.sh"
bash -n "$install" || bad "bash -n install-hermes-chrome-cdp.sh"
bash -n "$configure" || bad "bash -n configure-browser-control.sh"

# configure --help exits 0
bash "$configure" --help >/dev/null || bad "configure --help"

if [[ "$fail" -eq 0 ]]; then
  ok "hermes chrome-cdp contracts"
  exit 0
fi
echo "FAILED ${fail} hermes chrome-cdp checks" >&2
exit 1
