#!/usr/bin/env bash
# Install LaunchAgent for the chrome.debugger CDP bridge (no Chrome restart).
# Mutually exclusive with com.hermes.chrome-cdp on port 9222 — this script bootouts
# the dedicated-profile CDP healer while debugger mode is active.
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
label="com.hermes.chrome-debugger"
cdp_label="com.hermes.chrome-cdp"
plist_src="${repo_root}/com.hermes.chrome-debugger.plist"
plist_dst="${HOME}/Library/LaunchAgents/${label}.plist"
bridge="${repo_root}/scripts/hermes-chrome-debugger-bridge.js"
uid="$(id -u)"

[[ -f "$plist_src" ]] || { echo "missing $plist_src" >&2; exit 1; }
[[ -f "$bridge" ]] || { echo "missing $bridge" >&2; exit 1; }
command -v node >/dev/null || { echo "node required for chrome.debugger bridge" >&2; exit 1; }

mkdir -p "${HOME}/Library/LaunchAgents" "${HOME}/Library/Logs"

# Free :9222 — stop dedicated Chrome CDP healer (debugger bridge owns the port).
if launchctl print "gui/${uid}/${cdp_label}" >/dev/null 2>&1; then
  launchctl bootout "gui/${uid}/${cdp_label}" 2>/dev/null || true
fi
# Best-effort: kill a prior debugger bridge instance
if curl -sf --max-time 1 "http://127.0.0.1:9222/json/version" 2>/dev/null \
  | grep -q 'chrome.debugger-bridge'; then
  launchctl bootout "gui/${uid}/${label}" 2>/dev/null || true
  sleep 0.5
fi

sed \
  -e "s|{{REPO}}|${repo_root}|g" \
  -e "s|{{HOME}}|${HOME}|g" \
  "$plist_src" >"$plist_dst"

launchctl bootout "gui/${uid}/${label}" 2>/dev/null || true
launchctl bootstrap "gui/${uid}" "$plist_dst"
launchctl enable "gui/${uid}/${label}" 2>/dev/null || true
launchctl kickstart -k "gui/${uid}/${label}" 2>/dev/null || launchctl kickstart "gui/${uid}/${label}"

# Wait for /json/version
ok=0
for _ in $(seq 1 20); do
  if curl -sf --max-time 1 "http://127.0.0.1:9222/json/version" 2>/dev/null \
    | grep -q 'chrome.debugger-bridge'; then
    ok=1
    break
  fi
  sleep 0.25
done

if [[ "$ok" -ne 1 ]]; then
  echo "debugger bridge failed to expose /json/version on 127.0.0.1:9222" >&2
  echo "see ${HOME}/Library/Logs/hermes-chrome-debugger.log" >&2
  exit 1
fi

echo "installed ${label} (chrome.debugger bridge on :9222, extension relay :9223)"
