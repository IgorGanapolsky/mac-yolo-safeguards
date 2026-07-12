#!/usr/bin/env bash
set -euo pipefail

source_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
target_repo="${source_root}"

while (($#)); do
  case "$1" in
    --repo)
      target_repo="${2:?--repo requires a path}"
      shift 2
      ;;
    -h|--help)
      echo "Usage: bash scripts/install-repo-root-hygiene-agent.sh [--repo PATH]"
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      exit 2
      ;;
  esac
done

target_repo="$(cd "${target_repo}" && pwd)"
git -C "${target_repo}" rev-parse --show-toplevel >/dev/null

node_bin="$(command -v node)"
uid="$(id -u)"
label="com.igor.repo-root-hygiene"
runtime_dir="${HOME}/.local/share/mac-yolo-safeguards/root-hygiene"
runtime_tool="${runtime_dir}/repo-root-hygiene.js"
launchagents_dir="${HOME}/Library/LaunchAgents"
plist_dest="${launchagents_dir}/${label}.plist"
log_dir="${HOME}/Library/Logs/mac-yolo"

mkdir -p "${runtime_dir}" "${launchagents_dir}" "${log_dir}"
install -m 700 "${source_root}/tools/repo-root-hygiene.js" "${runtime_tool}"

sed \
  -e "s|{{NODE}}|${node_bin}|g" \
  -e "s|{{TOOL}}|${runtime_tool}|g" \
  -e "s|{{REPO}}|${target_repo}|g" \
  -e "s|{{HOME}}|${HOME}|g" \
  "${source_root}/com.igor.repo-root-hygiene.plist" > "${plist_dest}"
chmod 600 "${plist_dest}"
plutil -lint "${plist_dest}" >/dev/null

"${node_bin}" "${runtime_tool}" --repo "${target_repo}" --repair --json

launchctl bootout "gui/${uid}/${label}" 2>/dev/null || true
launchctl bootstrap "gui/${uid}" "${plist_dest}"
launchctl enable "gui/${uid}/${label}" 2>/dev/null || true
launchctl kickstart -k "gui/${uid}/${label}"

launchctl print "gui/${uid}/${label}" | grep -E 'state =|run interval =|last exit code ='
echo "Installed ${label} for ${target_repo}"
