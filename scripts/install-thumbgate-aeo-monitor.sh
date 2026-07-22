#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
node_bin="$(command -v node)"
parallel_cli="$(command -v parallel-cli)"
user_home="${HOME}"
label="com.igor.thumbgate-aeo-monitor"
template="${repo_root}/${label}.plist"
destination="${user_home}/Library/LaunchAgents/${label}.plist"
gui_domain="gui/$(id -u)"
runtime_path="$(dirname "${node_bin}"):$(dirname "${parallel_cli}"):/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"

mkdir -p "${user_home}/Library/LaunchAgents" "${user_home}/Library/Logs/mac-yolo"
sed \
  -e "s#{{REPO}}#${repo_root}#g" \
  -e "s#{{HOME}}#${user_home}#g" \
  -e "s#{{NODE}}#${node_bin}#g" \
  -e "s#{{PARALLEL_CLI}}#${parallel_cli}#g" \
  -e "s#{{PATH}}#${runtime_path}#g" \
  "${template}" > "${destination}"

plutil -lint "${destination}"
launchctl bootout "${gui_domain}/${label}" 2>/dev/null || true
launchctl bootstrap "${gui_domain}" "${destination}"
launchctl enable "${gui_domain}/${label}"
launchctl print "${gui_domain}/${label}" | grep -E 'state =|program =|path ='
