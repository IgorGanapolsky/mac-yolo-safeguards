#!/usr/bin/env bash
set -u

REPO="$(cd "$(dirname "$0")/.." && pwd)"
WATCHDOG="$REPO/scripts/hermes-tailscale-health-watchdog.sh"
TMP="$(mktemp -d "${TMPDIR:-/tmp}/hermes-tail-watchdog.XXXXXX")"
trap 'rm -rf "$TMP"' EXIT INT TERM
mkdir -p "$TMP/bin" "$TMP/home/Library/Logs"

pass=0; fail=0
ok() { printf '  [PASS] %s\n' "$1"; pass=$((pass + 1)); }
bad() { printf '  [FAIL] %s\n' "$1"; fail=$((fail + 1)); }

cat > "$TMP/bin/tailscale" <<'EOF'
#!/usr/bin/env bash
if [[ "${TAILSCALE_MODE:-online}" == offline ]]; then
  printf '%s\n' '{"BackendState":"Stopped","Self":{"Online":false,"TailscaleIPs":[]}}'
else
  printf '%s\n' '{"BackendState":"Running","Self":{"Online":true,"TailscaleIPs":["100.87.85.85"]}}'
fi
EOF

cat > "$TMP/bin/curl" <<'EOF'
#!/usr/bin/env bash
url="${*: -1}"
if [[ "$*" == *"-w"* ]]; then
  if [[ "$url" == *":8642/health"* && "${GATEWAY_MODE:-healthy}" == healthy ]]; then printf '200'; else printf '503'; fi
  exit 0
fi
if [[ "$url" == *":8765/pair.json"* ]]; then
  if [[ "${PAIR_MODE:-healthy}" == healthy || -f "${REPAIR_MARKER:-/nonexistent}" ]]; then
    printf '%s' '{"gatewayUrl":"http://100.87.85.85:8642","deepLink":"hermes://setup?pairCode=ABC12345&pairServer=http%3A%2F%2F100.87.85.85%3A8765"}'
  else
    printf '%s' '{"gatewayUrl":"http://127.0.0.1:8642","deepLink":"hermes://setup?pairCode=ABC12345&pairServer=http%3A%2F%2F192.168.1.2%3A8765"}'
  fi
  exit 0
fi
exit 1
EOF

cat > "$TMP/bin/launchctl" <<'EOF'
#!/usr/bin/env bash
printf '%s\n' "$*" >> "$LAUNCHCTL_LOG"
EOF

cat > "$TMP/bin/open" <<'EOF'
#!/usr/bin/env bash
printf '%s\n' "$*" >> "$OPEN_LOG"
EOF

cat > "$TMP/fake-pair.js" <<'EOF'
const fs = require('fs');
fs.writeFileSync(process.env.REPAIR_MARKER, process.argv.slice(2).join(' '));
EOF

chmod +x "$TMP/bin/"*

run_watchdog() {
  HOME="$TMP/home" \
  HERMES_TAILSCALE_BIN="$TMP/bin/tailscale" \
  HERMES_CURL_BIN="$TMP/bin/curl" \
  HERMES_LAUNCHCTL_BIN="$TMP/bin/launchctl" \
  HERMES_OPEN_BIN="$TMP/bin/open" \
  HERMES_NODE_BIN="$(command -v node)" \
  HERMES_PAIR_SCRIPT="$TMP/fake-pair.js" \
  HERMES_TAILSCALE_WATCHDOG_LOG="$TMP/watchdog.log" \
  LAUNCHCTL_LOG="$TMP/launchctl.log" \
  OPEN_LOG="$TMP/open.log" \
  REPAIR_MARKER="$TMP/repaired" \
  "$WATCHDOG"
}

rm -f "$TMP/launchctl.log" "$TMP/open.log" "$TMP/repaired"
if TAILSCALE_MODE=online GATEWAY_MODE=healthy PAIR_MODE=healthy run_watchdog \
  && grep -q 'healthy tail_ip=100.87.85.85 gateway=200 pair=200' "$TMP/watchdog.log" \
  && [[ ! -e "$TMP/repaired" ]]; then
  ok 'healthy tick is idempotent and does not regenerate pairing state'
else
  bad 'healthy tick is idempotent and does not regenerate pairing state'
fi

rm -f "$TMP/launchctl.log" "$TMP/open.log" "$TMP/repaired"
if TAILSCALE_MODE=online GATEWAY_MODE=healthy PAIR_MODE=stale run_watchdog \
  && [[ -f "$TMP/repaired" ]] \
  && grep -q -- '--allow-local-key-fallback' "$TMP/repaired" \
  && grep -q -- '--no-adb' "$TMP/repaired" \
  && grep -q 'com.igor.hermes-mobile-pair-server' "$TMP/launchctl.log"; then
  ok 'stale LAN pair payload is regenerated with local-key fallback and KeepAlive pair server is kicked'
else
  bad 'stale LAN pair payload is regenerated with local-key fallback and KeepAlive pair server is kicked'
fi

rm -f "$TMP/launchctl.log" "$TMP/open.log" "$TMP/repaired"
if ! TAILSCALE_MODE=offline GATEWAY_MODE=healthy PAIR_MODE=healthy run_watchdog \
  && grep -q -- '-ga Tailscale' "$TMP/open.log"; then
  ok 'offline Tailscale requests app recovery and fails the health tick honestly'
else
  bad 'offline Tailscale requests app recovery and fails the health tick honestly'
fi

rm -f "$TMP/launchctl.log" "$TMP/open.log" "$TMP/repaired"
if ! TAILSCALE_MODE=online GATEWAY_MODE=down PAIR_MODE=healthy run_watchdog \
  && grep -q 'com.igor.hermes-gateway-watchdog' "$TMP/launchctl.log"; then
  ok 'gateway failure kicks its dedicated watchdog and fails the health tick honestly'
else
  bad 'gateway failure kicks its dedicated watchdog and fails the health tick honestly'
fi

for plist in \
  "$REPO/com.igor.hermes-gateway-watchdog.plist" \
  "$REPO/com.igor.hermes-mobile-pair-server.plist" \
  "$REPO/com.igor.hermes-tailscale-health-watchdog.plist"; do
  if plutil -lint "$plist" >/dev/null; then
    ok "valid plist: $(basename "$plist")"
  else
    bad "valid plist: $(basename "$plist")"
  fi
done

installer="$(cat "$REPO/scripts/install-agent-launchagents.sh")"
if [[ "$installer" == *'com.igor.hermes-gateway-watchdog.plist'* ]] \
  && [[ "$installer" == *'com.igor.hermes-mobile-pair-server.plist'* ]] \
  && [[ "$installer" == *'com.igor.hermes-tailscale-health-watchdog.plist'* ]]; then
  ok 'LaunchAgent installer owns all three durability services'
else
  bad 'LaunchAgent installer owns all three durability services'
fi

focused_installer="$(cat "$REPO/scripts/install-hermes-tailscale-health-agents.sh")"
if [[ "$focused_installer" == *'stop_legacy_pair_server'* ]] \
  && [[ "$focused_installer" == *'hermes-mobile-pair.js'* ]] \
  && [[ "$focused_installer" == *'HERMES_PIN_MODEL'* ]] \
  && [[ "$focused_installer" == *'host_short'* ]]; then
  ok 'focused installer replaces only the legacy pair daemon and scopes model pinning by host'
else
  bad 'focused installer replaces only the legacy pair daemon and scopes model pinning by host'
fi

enable_line="$(grep -n 'launchctl enable' "$REPO/scripts/install-hermes-tailscale-health-agents.sh" | head -1 | cut -d: -f1)"
bootstrap_line="$(grep -n 'launchctl bootstrap' "$REPO/scripts/install-hermes-tailscale-health-agents.sh" | head -1 | cut -d: -f1)"
if [[ -n "$enable_line" && -n "$bootstrap_line" && "$enable_line" -lt "$bootstrap_line" ]]; then
  ok 'focused installer re-enables previously disabled labels before bootstrap'
else
  bad 'focused installer re-enables previously disabled labels before bootstrap'
fi

if grep -q '<key>HERMES_PIN_MODEL</key><string>{{HERMES_PIN_MODEL}}</string>' \
  "$REPO/com.igor.hermes-gateway-watchdog.plist"; then
  ok 'gateway watchdog plist requires explicit per-host model pin policy'
else
  bad 'gateway watchdog plist requires explicit per-host model pin policy'
fi

printf '\n%s passed, %s failed\n' "$pass" "$fail"
exit "$fail"
