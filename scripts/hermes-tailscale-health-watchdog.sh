#!/usr/bin/env bash
# Durable Hermes tailnet sentinel. It never pairs or drives a phone: every 60 seconds it
# proves this Mac is online in Tailscale, the local gateway answers, and the secretless
# pair document/server advertise this Mac's cellular-reachable tailnet address.
set -uo pipefail

REPO_ROOT="${HERMES_REPO_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
NODE_BIN="${HERMES_NODE_BIN:-$(command -v node)}"
CURL_BIN="${HERMES_CURL_BIN:-$(command -v curl)}"
LAUNCHCTL_BIN="${HERMES_LAUNCHCTL_BIN:-$(command -v launchctl)}"
OPEN_BIN="${HERMES_OPEN_BIN:-$(command -v open)}"
PAIR_SCRIPT="${HERMES_PAIR_SCRIPT:-${REPO_ROOT}/tools/hermes-mobile-pair.js}"
GATEWAY_URL="${HERMES_GATEWAY_HEALTH_URL:-http://127.0.0.1:8642/health}"
PAIR_URL="${HERMES_PAIR_HEALTH_URL:-http://127.0.0.1:8765/pair.json}"
LOG="${HERMES_TAILSCALE_WATCHDOG_LOG:-${HOME}/Library/Logs/hermes-tailscale-health-watchdog.log}"
GUI_DOMAIN="gui/$(id -u)"

resolve_tailscale_bin() {
  local candidate
  for candidate in \
    "${HERMES_TAILSCALE_BIN:-}" \
    /Applications/Tailscale.app/Contents/MacOS/Tailscale \
    /opt/homebrew/bin/tailscale \
    /usr/local/bin/tailscale; do
    if [[ -n "$candidate" && -x "$candidate" ]]; then
      printf '%s\n' "$candidate"
      return 0
    fi
  done
  return 1
}

mkdir -p "$(dirname "$LOG")" 2>/dev/null || true
logline() { printf '%s %s\n' "$(date '+%Y-%m-%dT%H:%M:%S%z')" "$1" >> "$LOG" 2>/dev/null || true; }
http_code() {
  "$CURL_BIN" -sS --max-time 5 -o /dev/null -w '%{http_code}' "$1" 2>/dev/null || printf '000'
}
kickstart() {
  "$LAUNCHCTL_BIN" kickstart -k "${GUI_DOMAIN}/$1" >/dev/null 2>&1 || true
}

TAILSCALE_BIN="$(resolve_tailscale_bin || true)"
if [[ -z "$TAILSCALE_BIN" ]]; then
  logline 'tailscale CLI missing'
  exit 1
fi

status_json="$($TAILSCALE_BIN status --json 2>/dev/null || true)"
tail_ip="$(printf '%s' "$status_json" | "$NODE_BIN" -e '
let raw=""; process.stdin.on("data", d => raw += d).on("end", () => {
  try {
    const json = JSON.parse(raw);
    const self = json.Self || {};
    const ip = (self.TailscaleIPs || []).find(v => /^100\./.test(v));
    if (self.Online === false || json.BackendState !== "Running" || !ip) process.exit(1);
    process.stdout.write(ip);
  } catch { process.exit(1); }
});' 2>/dev/null || true)"

if [[ -z "$tail_ip" ]]; then
  "$OPEN_BIN" -ga Tailscale >/dev/null 2>&1 || true
  logline 'tailscale self offline -> requested app start'
  exit 1
fi

gateway_code="$(http_code "$GATEWAY_URL")"
if [[ "$gateway_code" != '200' ]]; then
  kickstart com.igor.hermes-gateway-watchdog
  logline "gateway unhealthy (http=$gateway_code) -> kicked gateway watchdog"
  exit 1
fi

pair_json="$($CURL_BIN -sS --max-time 5 "$PAIR_URL" 2>/dev/null || true)"
pair_valid="$(printf '%s' "$pair_json" | "$NODE_BIN" -e '
const expected = process.argv[1]; let raw="";
process.stdin.on("data", d => raw += d).on("end", () => {
  try {
    const json = JSON.parse(raw);
    const gatewayHost = new URL(json.gatewayUrl).hostname;
    const setup = new URL(json.deepLink);
    const pairHost = new URL(setup.searchParams.get("pairServer")).hostname;
    const valid = gatewayHost === expected && pairHost === expected && !!setup.searchParams.get("pairCode");
    process.stdout.write(valid ? "yes" : "no");
  } catch { process.stdout.write("no"); }
});' "$tail_ip" 2>/dev/null || printf 'no')"

if [[ "$pair_valid" != 'yes' ]]; then
  logline "pair service stale or unreachable -> regenerating for $tail_ip"
  "$NODE_BIN" "$PAIR_SCRIPT" --no-adb --no-dev-unlock >/dev/null 2>&1 || true
  kickstart com.igor.hermes-mobile-pair-server
  sleep 1
  pair_json="$($CURL_BIN -sS --max-time 5 "$PAIR_URL" 2>/dev/null || true)"
  pair_valid="$(printf '%s' "$pair_json" | "$NODE_BIN" -e '
const expected = process.argv[1]; let raw="";
process.stdin.on("data", d => raw += d).on("end", () => {
  try {
    const json = JSON.parse(raw); const setup = new URL(json.deepLink);
    const ok = new URL(json.gatewayUrl).hostname === expected &&
      new URL(setup.searchParams.get("pairServer")).hostname === expected &&
      !!setup.searchParams.get("pairCode");
    process.stdout.write(ok ? "yes" : "no");
  } catch { process.stdout.write("no"); }
});' "$tail_ip" 2>/dev/null || printf 'no')"
fi

if [[ "$pair_valid" != 'yes' ]]; then
  logline "pair service repair failed for $tail_ip"
  exit 1
fi

logline "healthy tail_ip=$tail_ip gateway=200 pair=200"
exit 0
