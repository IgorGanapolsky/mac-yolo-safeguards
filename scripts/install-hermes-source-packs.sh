#!/usr/bin/env bash
# Install Hermes source packs locally and, when reachable, on peer Macs.
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
node_bin="$(command -v node)"
remote_hosts=()
local_only=0

usage() {
  cat <<'EOF'
Usage:
  bash scripts/install-hermes-source-packs.sh [--remote HOST ...] [--local-only]

Installs the NotebookLM-style Hermes Source Packs into ~/.hermes/source-packs,
loads the refresh LaunchAgent, and optionally syncs the same runtime files to
remote Macs via ssh/rsync.
EOF
}

while (($#)); do
  case "$1" in
    --remote)
      shift
      [[ $# -gt 0 ]] || { echo "--remote requires a host" >&2; exit 2; }
      remote_hosts+=("$1")
      ;;
    --local-only)
      local_only=1
      ;;
    --help|-h)
      usage
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      exit 2
      ;;
  esac
  shift
done

if [[ -z "${node_bin}" ]]; then
  echo "node not found in PATH" >&2
  exit 1
fi

install_local() {
  mkdir -p "${HOME}/.hermes/logs"
  "${node_bin}" "${repo_root}/tools/hermes-source-packs.js" --apply --json
  bash "${repo_root}/scripts/install-agent-launchagents.sh" >/tmp/hermes-source-packs-launchagent-install.log
  echo "local: source packs applied"
  grep 'OK com.igor.hermes-source-packs' /tmp/hermes-source-packs-launchagent-install.log >/dev/null
  echo "local: com.igor.hermes-source-packs loaded"
}

install_remote_runtime() {
  local host="$1"
  local tmp_remote
  local remote_home
  local remote_repo
  local remote_node
  tmp_remote="/tmp/hermes-source-packs-${USER}-$$"
  remote_home="$(ssh -o BatchMode=yes -o ConnectTimeout=8 "${host}" 'printf "%s" "$HOME"')"
  remote_repo="${remote_home}/workspace/git/igor/mac-yolo-safeguards"
  remote_node="$(ssh -o BatchMode=yes -o ConnectTimeout=8 "${host}" 'command -v node')"
  if [[ -z "${remote_node}" ]]; then
    echo "${host}: node not found; cannot install source-pack refresher" >&2
    return 1
  fi

  ssh -o BatchMode=yes -o ConnectTimeout=8 "${host}" "mkdir -p '${tmp_remote}/source-packs' ~/.hermes/source-packs ~/.hermes/logs ~/.hermes/bin ~/Library/LaunchAgents"
  rsync -a "${HOME}/.hermes/source-packs/" "${host}:${tmp_remote}/source-packs/"
  rsync -a "${repo_root}/tools/hermes-source-packs.js" "${host}:~/.hermes/bin/hermes-source-packs.js"
  ssh -o BatchMode=yes -o ConnectTimeout=8 "${host}" "mkdir -p '${remote_repo}/tools' '${remote_repo}/tests'"
  rsync -a \
    "${repo_root}/tools/hermes-source-packs.js" \
    "${repo_root}/tools/hermes-goal-cells.js" \
    "${host}:${remote_repo}/tools/"
  rsync -a \
    "${repo_root}/tests/test-hermes-goal-cells.js" \
    "${host}:${remote_repo}/tests/"
  ssh -o BatchMode=yes -o ConnectTimeout=8 "${host}" "rsync -a '${tmp_remote}/source-packs/' ~/.hermes/source-packs/ && rm -rf '${tmp_remote}' && chmod +x ~/.hermes/bin/hermes-source-packs.js && test -s ~/.hermes/source-packs/index.json"
  ssh -o BatchMode=yes -o ConnectTimeout=8 "${host}" "cat > ~/Library/LaunchAgents/com.igor.hermes-source-packs.plist" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.igor.hermes-source-packs</string>
  <key>ProgramArguments</key>
  <array>
    <string>${remote_node}</string>
    <string>${remote_home}/.hermes/bin/hermes-source-packs.js</string>
    <string>--apply</string>
    <string>--json</string>
    <string>--repo</string>
    <string>${remote_repo}</string>
  </array>
  <key>EnvironmentVariables</key>
  <dict>
    <key>HOME</key>
    <string>${remote_home}</string>
  </dict>
  <key>RunAtLoad</key>
  <true/>
  <key>StartInterval</key>
  <integer>1800</integer>
  <key>StandardOutPath</key>
  <string>${remote_home}/.hermes/logs/source-packs.out.log</string>
  <key>StandardErrorPath</key>
  <string>${remote_home}/.hermes/logs/source-packs.err.log</string>
</dict>
</plist>
EOF
  ssh -o BatchMode=yes -o ConnectTimeout=8 "${host}" "launchctl bootout \"gui/\$(id -u)/com.igor.hermes-source-packs\" 2>/dev/null || true; launchctl bootstrap \"gui/\$(id -u)\" ~/Library/LaunchAgents/com.igor.hermes-source-packs.plist; launchctl enable \"gui/\$(id -u)/com.igor.hermes-source-packs\" 2>/dev/null || true; launchctl kickstart -k \"gui/\$(id -u)/com.igor.hermes-source-packs\" 2>/dev/null || true; launchctl print \"gui/\$(id -u)/com.igor.hermes-source-packs\" >/dev/null"
  echo "${host}: source packs synced"
  echo "${host}: com.igor.hermes-source-packs loaded"
}

install_local

if (( local_only == 0 )); then
  if ((${#remote_hosts[@]} == 0)); then
    remote_hosts=(macmini)
  fi
  for host in "${remote_hosts[@]}"; do
    if ssh -o BatchMode=yes -o ConnectTimeout=8 "${host}" 'hostname >/dev/null' 2>/dev/null; then
      install_remote_runtime "${host}"
    else
      echo "${host}: unreachable; local source packs still installed" >&2
    fi
  done
fi
