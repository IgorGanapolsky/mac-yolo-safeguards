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

plists=(
  com.igor.shutdown-simulators.plist
  com.igor.ceo-operating-brief.plist
  com.igor.hermes-source-packs.plist
  com.igor.react-native-newsletter-ingest.plist
  com.igor.hermes-contribution-opportunities.plist
  com.igor.hermes-mobile-continuous-e2e.plist
  com.igor.hermes-relay-worker.plist
  com.igor.revenue-autonomous-loop.plist
  com.igor.smart-ops.plist
  com.igor.hermes-prevention-watchdog.plist
)

# CDP browser health (separate label namespace) — heal, never disable browser toolset
if [[ -x "${repo_root}/scripts/install-hermes-chrome-cdp.sh" ]]; then
  bash "${repo_root}/scripts/install-hermes-chrome-cdp.sh" || echo "WARN: chrome-cdp install incomplete" >&2
fi

install_one() {
  local template="$1"
  local label="${template%.plist}"
  local dest="${launchagents_dir}/${label}.plist"

  if [[ ! -f "${repo_root}/${template}" ]]; then
    echo "SKIP missing template: ${template}" >&2
    return 0
  fi

  sed "s#{{REPO}}#${repo_root}#g; s#{{HOME}}#${home}#g; s#{{NODE}}#${node_bin}#g; s#{{JAVA_HOME}}#${java_home}#g" \
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

echo ""
echo "Installed ${#plists[@]} LaunchAgent templates. Verify with:"
echo "  bash scripts/verify-agent-automations.sh"
echo "  node tools/agent-session-start.js"
echo "  node tools/revenue-autonomous-loop.js --json"
