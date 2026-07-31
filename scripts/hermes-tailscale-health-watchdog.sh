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

# Self-heal-failure alerting. This watchdog was found with zero alerting of any
# kind: it already self-heals (regenerates the pair document with an immediate
# same-tick recheck; kicks the gateway watchdog / opens Tailscale for the
# async cases) but a repair that doesn't land was previously discoverable only
# by a human noticing "why is my phone offline". Some of its heals are
# synchronous+rechecked in this tick (pair regen) and some are async and need
# the NEXT ~60s tick to prove out (gateway watchdog kickstart, Tailscale app
# open) -- so, to avoid alerting on the very tick a fix was just kicked off,
# this uses the same 2-tick healing->degraded state machine as
# hermes-gateway-watchdog.sh: first bad tick = healing (routine, silent);
# still bad on the following tick = the self-heal attempt failed to resolve
# it, which is what nobody currently hears about. finish() is the single exit
# path so every "exit N" below carries the same edge-triggered alert without
# changing any of the actual heal logic that runs before it.
ALERT_STATE="${HERMES_TAILSCALE_WATCHDOG_ALERT_STATE:-${HOME}/Library/Logs/mac-yolo/hermes-tailscale-health-watchdog.state}"
ALERT_NTFY_TOPIC="${HERMES_TAILSCALE_WATCHDOG_NTFY_TOPIC:-yolo-guard-fdh8ktuw1vtxb5sb}"
ALERT_NTFY_URL="${HERMES_TAILSCALE_WATCHDOG_NTFY_URL:-https://ntfy.sh/$ALERT_NTFY_TOPIC}"
mkdir -p "$(dirname "$ALERT_STATE")" 2>/dev/null || true

finish() {
  local exit_code="$1" reason="$2"
  local prev
  prev="$(cat "$ALERT_STATE" 2>/dev/null || echo ok)"
  if [[ "$exit_code" -eq 0 ]]; then
    if [[ "$prev" == "degraded" ]]; then
      "$CURL_BIN" -sS -m 10 -H "Title: Hermes tailscale watchdog recovered" \
        -d "recovered at $(date '+%Y-%m-%dT%H:%M:%S%z'): $reason" "$ALERT_NTFY_URL" >/dev/null 2>&1 || true
    fi
    printf 'ok' > "$ALERT_STATE" 2>/dev/null || true
  else
    case "$prev" in
      healing)
        alert_body="Hermes tailscale watchdog self-heal failed at $(date '+%Y-%m-%dT%H:%M:%S%z'): $reason"
        "$CURL_BIN" -sS -m 10 -H "Title: Hermes tailscale watchdog self-heal failed" -H "Priority: high" \
          -d "$alert_body" "$ALERT_NTFY_URL" >/dev/null 2>&1 || true
        printf 'degraded' > "$ALERT_STATE" 2>/dev/null || true
        ;;
      degraded)
        : # already alerted this outage; stay silent until recovery (edge-triggered)
        ;;
      *)
        printf 'healing' > "$ALERT_STATE" 2>/dev/null || true
        ;;
    esac
  fi
  exit "$exit_code"
}

TAILSCALE_BIN="$(resolve_tailscale_bin || true)"
if [[ -z "$TAILSCALE_BIN" ]]; then
  logline 'tailscale CLI missing'
  finish 1 'tailscale CLI missing'
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
  finish 1 'tailscale self offline'
fi

gateway_code="$(http_code "$GATEWAY_URL")"
if [[ "$gateway_code" != '200' ]]; then
  kickstart com.igor.hermes-gateway-watchdog
  logline "gateway unhealthy (http=$gateway_code) -> kicked gateway watchdog"
  finish 1 "gateway unhealthy http=$gateway_code"
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
  # Mini (and other headless hosts) need local-key fallback when SSH self-lookup is a no-op.
  # Pair-server KeepAlive may also rewrite pair.json via --server-only; that path must emit
  # secretless pairCode (see hermes-mobile-pair.js refreshPairAssetsFromLocalGateway).
  "$NODE_BIN" "$PAIR_SCRIPT" --no-adb --no-dev-unlock --allow-local-key-fallback >/dev/null 2>&1 || true
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
  finish 1 "pair service repair failed for $tail_ip"
fi

logline "healthy tail_ip=$tail_ip gateway=200 pair=200"
finish 0 "healthy tail_ip=$tail_ip gateway=200 pair=200"
