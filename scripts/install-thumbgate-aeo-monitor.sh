#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
node_bin="$(command -v node)"
parallel_cli="$(command -v parallel-cli)"
user_home="${HOME}"
runtime_dir="${user_home}/.local/share/thumbgate-aeo"
label="com.igor.thumbgate-aeo-monitor"
template="${repo_root}/${label}.plist"
destination="${user_home}/Library/LaunchAgents/${label}.plist"
gui_domain="gui/$(id -u)"
runtime_path="$(dirname "${node_bin}"):$(dirname "${parallel_cli}"):/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"

mkdir -p \
  "${user_home}/Library/LaunchAgents" \
  "${user_home}/Library/Logs/mac-yolo" \
  "${runtime_dir}/tools" \
  "${runtime_dir}/config"
install -m 0755 "${repo_root}/tools/thumbgate-aeo-monitor.js" "${runtime_dir}/tools/thumbgate-aeo-monitor.js"
install -m 0755 "${repo_root}/tools/hermes-parallel-search.js" "${runtime_dir}/tools/hermes-parallel-search.js"
install -m 0644 "${repo_root}/config/thumbgate-aeo-prompts.json" "${runtime_dir}/config/thumbgate-aeo-prompts.json"
sed \
  -e "s#{{RUNTIME}}#${runtime_dir}#g" \
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
