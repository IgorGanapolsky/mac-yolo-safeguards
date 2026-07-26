#!/usr/bin/env bash
# Install com.igor.revenue-loop-watchdog, the only durability check on the two
# revenue-loop LaunchAgents (com.igor.revenue-autonomous-loop, com.igor.ralph-gsd-loop).
# Idempotent: safe to re-run on a live Mac.
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
home="${HOME}"
uid="$(id -u)"
gui_domain="gui/${uid}"
launchagents_dir="${home}/Library/LaunchAgents"
template="com.igor.revenue-loop-watchdog.plist"
label="${template%.plist}"

mkdir -p "$launchagents_dir" "${home}/Library/Logs/mac-yolo"

sed "s#{{REPO}}#${repo_root}#g; s#{{HOME}}#${home}#g" \
  "${repo_root}/${template}" > "${launchagents_dir}/${template}"

launchctl bootout "${gui_domain}/${label}" >/dev/null 2>&1 || true
launchctl enable "${gui_domain}/${label}" >/dev/null 2>&1 || true
launchctl bootstrap "$gui_domain" "${launchagents_dir}/${template}"
launchctl kickstart -k "${gui_domain}/${label}" >/dev/null 2>&1 || true

printf 'OK %s -> %s\n' "$label" "$repo_root"
