#!/usr/bin/env bash
# Install com.igor.index-microbatch LaunchAgent (InfoQ micro-batch every 15m).
set -euo pipefail

# Prefer HERMES_REPO (stable main checkout) so a disposable worktree install does not rot.
repo_root="${HERMES_REPO:-$(cd "$(dirname "$0")/.." && pwd)}"
home="${HOME}"
uid_n="$(id -u)"
gui_domain="gui/${uid_n}"
launchagents_dir="${home}/Library/LaunchAgents"
template_src="${repo_root}/scripts/com.igor.index-microbatch.plist"
label="com.igor.index-microbatch"
dest="${launchagents_dir}/${label}.plist"

mkdir -p "${launchagents_dir}" "${home}/Library/Logs"

sed \
  -e "s|REPO_ROOT_PLACEHOLDER|${repo_root}|g" \
  -e "s|PLACEHOLDER|$(whoami)|g" \
  "${template_src}" > "${dest}"

launchctl bootout "${gui_domain}/${label}" 2>/dev/null || true
launchctl bootstrap "${gui_domain}" "${dest}"
launchctl enable "${gui_domain}/${label}" 2>/dev/null || true
launchctl kickstart -k "${gui_domain}/${label}" 2>/dev/null || true

echo "install-index-microbatch: loaded ${label}"
echo "  plist: ${dest}"
echo "  log:   ${home}/Library/Logs/index-microbatch.log"
echo "  test:  node ${repo_root}/tools/index-microbatch.js --once --heal --json"
