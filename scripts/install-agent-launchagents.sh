#!/usr/bin/env bash
# Install mac-yolo-safeguards LaunchAgents for autonomous agent jobs (CEO brief, newsletter, etc.)
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
home="${HOME}"
node_bin="$(command -v node)"
uid="$(id -u)"
gui_domain="gui/${uid}"
launchagents_dir="${home}/Library/LaunchAgents"

if [[ -z "$node_bin" ]]; then
  echo "node not found in PATH" >&2
  exit 1
fi

resolve_java_home() {
  local candidate
  for candidate in \
    "/opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home" \
    "/usr/local/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home" \
    "/opt/homebrew/opt/openjdk/libexec/openjdk.jdk/Contents/Home" \
    "/usr/local/opt/openjdk/libexec/openjdk.jdk/Contents/Home"; do
    if [[ -d "$candidate" && -x "$candidate/bin/java" ]]; then
      echo "$candidate"
      return 0
    fi
  done
  for candidate in /opt/homebrew/Cellar/openjdk@17/*/libexec/openjdk.jdk/Contents/Home \
    /usr/local/Cellar/openjdk@17/*/libexec/openjdk.jdk/Contents/Home; do
    if [[ -d "$candidate" && -x "$candidate/bin/java" ]]; then
      echo "$candidate"
      return 0
    fi
  done
  echo ""
}

java_home="$(resolve_java_home)"
if [[ -z "$java_home" ]]; then
  echo "WARN: openjdk@17 not found — Maestro E2E LaunchAgent may fail until brew install openjdk@17" >&2
  java_home="/opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home"
fi

if [[ "$(hostname -s | tr '[:upper:]' '[:lower:]')" == *mini* ]]; then
  hermes_pin_model=1
else
  hermes_pin_model=0
fi

plists=(
  com.igor.shutdown-simulators.plist
  com.igor.ceo-operating-brief.plist
  com.igor.hermes-source-packs.plist
  com.igor.react-native-newsletter-ingest.plist
  com.igor.hermes-contribution-opportunities.plist
  com.igor.hermes-mobile-continuous-e2e.plist
  com.igor.hermes-gateway-watchdog.plist
  com.igor.hermes-mobile-pair-server.plist
  com.igor.hermes-tailscale-health-watchdog.plist
  com.igor.hermes-mobile-itunes-poll.plist
  com.igor.hermes-mobile-play-paid-review-poll.plist
  com.igor.hermes-usb-reverse-watchdog.plist
  com.igor.hermes-tailscale-reachability.plist
  com.igor.hermes-relay-worker.plist
  com.igor.revenue-autonomous-loop.plist
  com.igor.smart-ops.plist
  com.igor.ralph-gsd-loop.plist
  com.igor.agent-vault-sync.plist
)

install_one() {
  local template="$1"
  local label="${template%.plist}"
  local dest="${launchagents_dir}/${label}.plist"

  if [[ ! -f "${repo_root}/${template}" ]]; then
    echo "SKIP missing template: ${template}" >&2
    return 0
  fi

  sed "s#{{REPO}}#${repo_root}#g; s#{{HOME}}#${home}#g; s#{{NODE}}#${node_bin}#g; s#{{JAVA_HOME}}#${java_home}#g; s#{{HERMES_PIN_MODEL}}#${hermes_pin_model}#g" \
    "${repo_root}/${template}" > "${dest}"

  launchctl bootout "${gui_domain}/${label}" 2>/dev/null || true
  launchctl bootstrap "${gui_domain}" "${dest}"
  launchctl enable "${gui_domain}/${label}" 2>/dev/null || true
  launchctl kickstart -k "${gui_domain}/${label}" 2>/dev/null || true
  echo "OK ${label}"
}

mkdir -p "${launchagents_dir}"
mkdir -p "${home}/Library/Logs/mac-yolo"
for template in "${plists[@]}"; do
  install_one "${template}"
done

if [[ -f "${repo_root}/scripts/install-repo-root-hygiene-agent.sh" ]]; then
  bash "${repo_root}/scripts/install-repo-root-hygiene-agent.sh" --repo "${repo_root}"
fi

# Browser control (Chrome CDP) + prevention watchdog — separate installers
# because they use dedicated labels outside the com.igor.* template list.
# Default OFF: never auto-launch interactive Chrome on the daily driver (2026-07-22).
if [[ "${HERMES_ALLOW_INTERACTIVE_CHROME:-0}" == "1" && -x "${repo_root}/scripts/install-hermes-chrome-cdp.sh" ]]; then
  bash "${repo_root}/scripts/install-hermes-chrome-cdp.sh" || \
    echo "WARN: install-hermes-chrome-cdp.sh did not reach IPv4 CDP yet" >&2
else
  echo "SKIP com.hermes.chrome-cdp (HERMES_ALLOW_INTERACTIVE_CHROME!=1)"
fi
if [[ -f "${repo_root}/com.igor.hermes-prevention-watchdog.plist" ]]; then
  install_one "com.igor.hermes-prevention-watchdog.plist"
fi

echo ""
echo "Installed ${#plists[@]} LaunchAgent templates (+ repo-root-hygiene; chrome-cdp only when HERMES_ALLOW_INTERACTIVE_CHROME=1). Verify with:"
echo "  bash scripts/verify-agent-automations.sh"
echo "  bash scripts/configure-browser-control.sh --status --json"
echo "  node tools/agent-session-start.js"
echo "  node tools/revenue-autonomous-loop.js --json"
echo "  node tools/ralph-gsd-loop.js --once --json"

# Fleet repo intelligence (local JetBrains Context equivalent)
if [[ -f "$REPO_ROOT/tools/install-fleet-repo-intelligence.sh" ]]; then
  bash "$REPO_ROOT/tools/install-fleet-repo-intelligence.sh" || true
fi

