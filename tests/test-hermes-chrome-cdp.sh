#!/usr/bin/env bash
# Contract tests for Hermes Chrome CDP heal (no live Chrome required).
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
chrome="${repo_root}/scripts/hermes-chrome-cdp.sh"
install="${repo_root}/scripts/install-hermes-chrome-cdp.sh"
configure="${repo_root}/scripts/configure-browser-control.sh"
bridge="${repo_root}/scripts/install-browser-bridge.sh"
wire="${repo_root}/scripts/wire-hermes-browser-cdp.sh"
plist="${repo_root}/com.hermes.chrome-cdp.plist"
docs="${repo_root}/docs/BROWSER-CONTROL.md"
teardown="${repo_root}/docs/KIMI-WEBBRIDGE-TEARDOWN.md"
fail=0

ok() { echo "ok $*"; }
bad() { echo "FAIL $*"; fail=$((fail + 1)); }

[[ -x "$chrome" ]] || bad "hermes-chrome-cdp.sh missing/executable"
[[ -x "$install" ]] || bad "install-hermes-chrome-cdp.sh missing/executable"
[[ -x "$configure" ]] || bad "configure-browser-control.sh missing/executable"
[[ -x "$bridge" ]] || bad "install-browser-bridge.sh missing/executable"
[[ -x "$wire" ]] || bad "wire-hermes-browser-cdp.sh missing/executable"
[[ -f "$plist" ]] || bad "com.hermes.chrome-cdp.plist missing"
[[ -f "$docs" ]] || bad "docs/BROWSER-CONTROL.md missing"
[[ -f "$teardown" ]] || bad "docs/KIMI-WEBBRIDGE-TEARDOWN.md missing"

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
grep -q 'wire-hermes-browser-cdp\|wire_cdp_url' <<<"$cfg" || bad "configure must wire cdp_url"

bridge_body="$(cat "$bridge")"
grep -q 'Bridge connected' <<<"$bridge_body" || bad "install-browser-bridge must say Bridge connected"
grep -q 'profile=daily\|--profile=daily' <<<"$bridge_body" || bad "install-browser-bridge must offer daily profile"

docs_body="$(cat "$docs")"
grep -q 'com.hermes.chrome-cdp' <<<"$docs_body" || bad "docs must name LaunchAgent"
grep -q 'Hermes Mobile' <<<"$docs_body" || bad "docs must cover mobile enable path"
grep -q 'install-browser-bridge' <<<"$docs_body" || bad "docs must show one-command install"

teardown_body="$(cat "$teardown")"
grep -q 'Compete' <<<"$teardown_body" || bad "teardown must have compete verdict"
grep -q 'Chrome DevTools Protocol\|CDP' <<<"$teardown_body" || bad "teardown must cite CDP architecture"

# wire script unit: empty config fixture
tmp="$(mktemp -d)"
printf 'browser:\n  engine: auto\n  cdp_url: '\'''\''\n' >"$tmp/config.yaml"
bash "$wire" --config "$tmp/config.yaml" --url 'ws://127.0.0.1:9222' --json >/dev/null \
  || bad "wire-hermes-browser-cdp on fixture"
grep -q "ws://127.0.0.1:9222" "$tmp/config.yaml" || bad "wire did not persist cdp_url"
rm -rf "$tmp"

# Syntax
bash -n "$chrome" || bad "bash -n hermes-chrome-cdp.sh"
bash -n "$install" || bad "bash -n install-hermes-chrome-cdp.sh"
bash -n "$configure" || bad "bash -n configure-browser-control.sh"
bash -n "$bridge" || bad "bash -n install-browser-bridge.sh"
bash -n "$wire" || bad "bash -n wire-hermes-browser-cdp.sh"

# configure --help exits 0
bash "$configure" --help >/dev/null || bad "configure --help"
bash "$bridge" --help >/dev/null || bad "install-browser-bridge --help"

if [[ "$fail" -eq 0 ]]; then
  ok "hermes chrome-cdp contracts"
  exit 0
fi
echo "FAILED ${fail} hermes chrome-cdp checks" >&2
exit 1
