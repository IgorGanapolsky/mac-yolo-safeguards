#!/usr/bin/env bash
# Install LaunchAgent com.hermes.chrome-cdp and start CDP once.
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
home="${HOME}"
uid="$(id -u)"
gui_domain="gui/${uid}"
launchagents_dir="${home}/Library/LaunchAgents"
label="com.hermes.chrome-cdp"
template="${repo_root}/com.hermes.chrome-cdp.plist"
dest="${launchagents_dir}/${label}.plist"

mkdir -p "${launchagents_dir}" "${home}/.hermes/chrome-cdp-profile"
chmod +x "${repo_root}/scripts/hermes-chrome-cdp.sh"

sed "s#{{REPO}}#${repo_root}#g; s#{{HOME}}#${home}#g" "${template}" > "${dest}"

launchctl bootout "${gui_domain}/${label}" 2>/dev/null || true
launchctl bootstrap "${gui_domain}" "${dest}"
launchctl enable "${gui_domain}/${label}" 2>/dev/null || true
launchctl kickstart -k "${gui_domain}/${label}" 2>/dev/null || true

# Also run once in-foreground for immediate proof
bash "${repo_root}/scripts/hermes-chrome-cdp.sh" || true

if curl -sf --max-time 3 "http://127.0.0.1:9222/json/version" >/dev/null; then
  echo "OK ${label} — CDP /json/version reachable"
  exit 0
fi

echo "WARN ${label} installed but CDP not yet reachable — check ~/Library/Logs/hermes-chrome-cdp.log" >&2
exit 1
