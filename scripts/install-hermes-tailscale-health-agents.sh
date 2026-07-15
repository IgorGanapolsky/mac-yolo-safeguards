#!/usr/bin/env bash
# Install only the three Hermes host-durability services. Safe for a live multi-agent Mac:
# no unrelated LaunchAgent is reloaded, and only an existing Hermes pair-server process
# may be replaced when launchd takes ownership of port 8765.
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
home="${HOME}"
node_bin="$(command -v node)"
uid="$(id -u)"
gui_domain="gui/${uid}"
launchagents_dir="${home}/Library/LaunchAgents"
host_short="$(hostname -s | tr '[:upper:]' '[:lower:]')"
if [[ "$host_short" == *mini* ]]; then
  hermes_pin_model=1
else
  hermes_pin_model=0
fi

templates=(
  com.igor.hermes-gateway-watchdog.plist
  com.igor.hermes-mobile-pair-server.plist
  com.igor.hermes-tailscale-health-watchdog.plist
)

stop_legacy_pair_server() {
  local pid command_line
  while read -r pid; do
    [[ -n "$pid" ]] || continue
    command_line="$(ps -p "$pid" -o command= 2>/dev/null || true)"
    if [[ "$command_line" == *hermes-mobile-pair.js* && "$command_line" == *--server-only* ]]; then
      kill "$pid" 2>/dev/null || true
    fi
  done < <(lsof -tiTCP:8765 -sTCP:LISTEN 2>/dev/null || true)
}

install_one() {
  local template="$1"
  local label="${template%.plist}"
  local dest="${launchagents_dir}/${template}"
  sed "s#{{REPO}}#${repo_root}#g; s#{{HOME}}#${home}#g; s#{{NODE}}#${node_bin}#g; s#{{HERMES_PIN_MODEL}}#${hermes_pin_model}#g" \
    "${repo_root}/${template}" > "$dest"
  launchctl bootout "${gui_domain}/${label}" 2>/dev/null || true
  if [[ "$label" == com.igor.hermes-mobile-pair-server ]]; then
    stop_legacy_pair_server
  fi
  launchctl bootstrap "$gui_domain" "$dest"
  launchctl enable "${gui_domain}/${label}" 2>/dev/null || true
  launchctl kickstart -k "${gui_domain}/${label}" 2>/dev/null || true
  printf 'OK %s\n' "$label"
}

mkdir -p "$launchagents_dir" "${home}/Library/Logs"
for template in "${templates[@]}"; do
  install_one "$template"
done

# The sentinel regenerates stale LAN-only pair state and then rechecks it.
launchctl kickstart -k "${gui_domain}/com.igor.hermes-tailscale-health-watchdog" 2>/dev/null || true
sleep 2
for template in "${templates[@]}"; do
  label="${template%.plist}"
  launchctl print "${gui_domain}/${label}" >/dev/null
done
printf 'Installed 3 Hermes durability services (HERMES_PIN_MODEL=%s).\n' "$hermes_pin_model"
