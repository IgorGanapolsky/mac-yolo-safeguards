#!/usr/bin/env bash
# Install the three coordinated freeze-prevention controls from durable user paths.
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
home="${HOME}"
uid="$(id -u)"
gui_domain="gui/${uid}"
launchagents_dir="$home/Library/LaunchAgents"
local_bin="$home/.local/bin"
hermes_dir="$home/.hermes"
skip_launchctl="${MAC_FREEZE_INSTALL_SKIP_LAUNCHCTL:-0}"

mkdir -p "$local_bin" "$hermes_dir/logs" "$launchagents_dir" "$home/Library/Logs"

install_script() {
  local source="$1" dest="$2"
  bash -n "$source"
  install -m 0755 "$source" "$dest"
}

render_plist() {
  local template="$1" dest="$2"
  sed "s#{{HOME}}#$home#g" "$template" > "$dest.tmp"
  install -m 0644 "$dest.tmp" "$dest"
  rm -f "$dest.tmp"
  if command -v plutil >/dev/null 2>&1; then plutil -lint "$dest" >/dev/null; fi
}

install_script "$repo_root/sim-runaway-guard.sh" "$local_bin/sim-runaway-guard.sh"
install_script "$repo_root/scripts/memory-pressure-guardian.sh" "$local_bin/memory-pressure-guardian.sh"
install_script "$repo_root/scripts/hermes-gateway-watchdog.sh" "$hermes_dir/hermes-gateway-watchdog.sh"

render_plist "$repo_root/com.igor.shutdown-simulators.plist" "$launchagents_dir/com.igor.shutdown-simulators.plist"
render_plist "$repo_root/com.igor.memory-pressure-guardian.plist" "$launchagents_dir/com.igor.memory-pressure-guardian.plist"
render_plist "$repo_root/com.igor.hermes-gateway-watchdog.plist" "$launchagents_dir/com.igor.hermes-gateway-watchdog.plist"

if grep -E '/private/tmp|actions-runner/_work|--dry-run' \
  "$launchagents_dir/com.igor.shutdown-simulators.plist" \
  "$launchagents_dir/com.igor.memory-pressure-guardian.plist" \
  "$launchagents_dir/com.igor.hermes-gateway-watchdog.plist" >/dev/null; then
  echo "ERROR: unstable path or dry-run mode found in installed freeze prevention" >&2
  exit 1
fi

if [[ "$skip_launchctl" != "1" ]]; then
  for label in com.igor.shutdown-simulators com.igor.memory-pressure-guardian com.igor.hermes-gateway-watchdog; do
    launchctl bootout "$gui_domain/$label" 2>/dev/null || true
    launchctl bootstrap "$gui_domain" "$launchagents_dir/$label.plist"
    launchctl enable "$gui_domain/$label" 2>/dev/null || true
    launchctl kickstart -k "$gui_domain/$label"
  done
fi

for installed in \
  "$local_bin/sim-runaway-guard.sh" \
  "$local_bin/memory-pressure-guardian.sh" \
  "$hermes_dir/hermes-gateway-watchdog.sh"; do
  printf 'INSTALLED %s sha256=%s\n' "$installed" "$(shasum -a 256 "$installed" | awk '{print $1}')"
done
printf 'LaunchAgents: stable paths, memory guardian live, Ollama pin/prewarm off by default\n'
