#!/usr/bin/env bash
# Install LaunchAgent com.hermes.chrome-cdp and start CDP once.
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck disable=SC1091
source "${repo_root}/scripts/hermes-interactive-chrome-gate.sh"
if ! hermes_require_interactive_chrome; then
  exit 0
fi
home="${HOME}"
uid="$(id -u)"
gui_domain="gui/${uid}"
launchagents_dir="${home}/Library/LaunchAgents"
label="com.hermes.chrome-cdp"
template="${repo_root}/com.hermes.chrome-cdp.plist"
dest="${launchagents_dir}/${label}.plist"

mkdir -p "${launchagents_dir}" "${home}/.hermes/chrome-cdp-profile"
chmod +x "${repo_root}/scripts/hermes-chrome-cdp.sh"
chmod +x "${repo_root}/scripts/configure-browser-control.sh" 2>/dev/null || true

sed "s#{{REPO}}#${repo_root}#g; s#{{HOME}}#${home}#g" "${template}" > "${dest}"

launchctl bootout "${gui_domain}/${label}" 2>/dev/null || true
launchctl bootstrap "${gui_domain}" "${dest}"
launchctl enable "${gui_domain}/${label}" 2>/dev/null || true
launchctl kickstart -k "${gui_domain}/${label}" 2>/dev/null || true

# Also run once in-foreground for immediate proof (reclaims IPv4 squats).
bash "${repo_root}/scripts/hermes-chrome-cdp.sh" || true

if curl -sf --max-time 3 "http://127.0.0.1:9222/json/version" 2>/dev/null | grep -q webSocketDebuggerUrl; then
  echo "OK ${label} — CDP /json/version reachable on 127.0.0.1:9222"
  exit 0
fi

echo "WARN ${label} installed but IPv4 CDP not yet reachable — check ~/Library/Logs/hermes-chrome-cdp.log" >&2
exit 1
