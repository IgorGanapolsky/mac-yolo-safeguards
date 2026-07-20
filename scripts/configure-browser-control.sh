#!/usr/bin/env bash
# Real-user / fleet installer for Hermes agent browser control (Chrome CDP).
# Extends the existing com.hermes.chrome-cdp hosting — does not invent a parallel stack.
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
json=0
apply=1

usage() {
  cat <<'EOF'
Usage: scripts/configure-browser-control.sh [--apply|--status] [--json]

  --apply   Install/heal LaunchAgent + CDP (default)
  --status  Probe only (no heal)
  --json    Emit one JSON object

What this enables
  Hermes agent browser tools (browser_navigate / browser_click / browser_cdp)
  talk to a dedicated Chrome profile on 127.0.0.1:9222. Hermes Mobile users
  do not install a phone browser extension — they pair to their Mac and use
  Chat; browser work runs on the Mac gateway.

Real-user path
  1. On the Mac: bash scripts/configure-browser-control.sh --apply
  2. Pair Hermes Mobile (QR / Find computers / Tailscale) — no adb required
  3. In Chat → Tools, leave Browser Automation enabled (auto-on when ready)
  4. Ask Hermes to open a page / click / fill forms
EOF
}

while (($#)); do
  case "$1" in
    --apply) apply=1 ;;
    --status) apply=0 ;;
    --json) json=1 ;;
    --help|-h) usage; exit 0 ;;
    *) echo "Unknown argument: $1" >&2; usage >&2; exit 64 ;;
  esac
  shift
done

cdp_ipv4=0
cdp_ipv6=0
agent=0
actions=()

probe() {
  if curl -sf --max-time 2 "http://127.0.0.1:9222/json/version" 2>/dev/null | grep -q webSocketDebuggerUrl; then
    cdp_ipv4=1
  fi
  if curl -sgf --max-time 2 "http://[::1]:9222/json/version" 2>/dev/null | grep -q webSocketDebuggerUrl; then
    cdp_ipv6=1
  fi
  if launchctl print "gui/$(id -u)/com.hermes.chrome-cdp" >/dev/null 2>&1; then
    agent=1
  fi
}

probe

if [[ "$apply" -eq 1 ]]; then
  if [[ -x "${repo_root}/scripts/install-hermes-chrome-cdp.sh" ]]; then
    if bash "${repo_root}/scripts/install-hermes-chrome-cdp.sh"; then
      actions+=("install_hermes_chrome_cdp")
    else
      actions+=("install_hermes_chrome_cdp_warned")
    fi
  fi
  if [[ -x "${repo_root}/scripts/hermes-chrome-cdp.sh" ]]; then
    if bash "${repo_root}/scripts/hermes-chrome-cdp.sh"; then
      actions+=("heal_cdp")
    else
      actions+=("heal_cdp_failed")
    fi
  fi
  probe
fi

ok=0
if [[ "$cdp_ipv4" -eq 1 && "$agent" -eq 1 ]]; then
  ok=1
fi

if [[ "$json" -eq 1 ]]; then
  python3 - "$ok" "$cdp_ipv4" "$cdp_ipv6" "$agent" "$(IFS=,; echo "${actions[*]-}")" <<'PY'
import json, sys
actions = [a for a in sys.argv[5].split(",") if a]
print(json.dumps({
  "ok": sys.argv[1] == "1",
  "cdpIpv4": sys.argv[2] == "1",
  "cdpIpv6": sys.argv[3] == "1",
  "launchAgent": sys.argv[4] == "1",
  "actions": actions,
  "port": 9222,
  "profile": "~/.hermes/chrome-cdp-profile",
  "mobilePath": "Pair Mac → Tools → Browser Automation on → chat asks Hermes to browse",
}, indent=2))
PY
else
  echo "=== Hermes browser control ==="
  echo "ok=${ok} cdpIpv4=${cdp_ipv4} cdpIpv6=${cdp_ipv6} launchAgent=${agent}"
  if ((${#actions[@]})); then echo "actions: ${actions[*]}"; fi
  if [[ "$ok" -eq 1 ]]; then
    echo "Ready: Hermes Mobile Chat can use Mac browser tools when Browser Automation is on."
  else
    echo "Not ready: fix CDP (see docs/BROWSER-CONTROL.md). Do not disable the browser toolset."
  fi
fi

[[ "$ok" -eq 1 ]]
