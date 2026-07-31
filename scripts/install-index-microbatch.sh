#!/usr/bin/env bash
# Install com.igor.index-microbatch LaunchAgent (InfoQ micro-batch every 15m).
set -euo pipefail

# Prefer HERMES_REPO (stable main checkout) so a disposable worktree install does not rot.
repo_root="${HERMES_REPO:-$(cd "$(dirname "$0")/.." && pwd)}"
# Never pin LaunchAgent to a disposable .worktrees/* path (measured 2026-07-31:
# agent still pointed at harness-wire-infoq-20260731 after merge → stale FF).
# Override with HERMES_ALLOW_WORKTREE_LAUNCHAGENT=1 only for short-lived pre-merge tests.
if [[ "${repo_root}" == *"/.worktrees/"* && "${HERMES_ALLOW_WORKTREE_LAUNCHAGENT:-}" != "1" ]]; then
  # .../mac-yolo-safeguards/.worktrees/<name> → .../mac-yolo-safeguards
  repo_root="$(cd "${repo_root}/../.." && pwd)"
  echo "install-index-microbatch: redirected worktree install → ${repo_root}"
fi
home="${HOME}"
uid_n="$(id -u)"
gui_domain="gui/${uid_n}"
launchagents_dir="${home}/Library/LaunchAgents"
template_src="${repo_root}/scripts/com.igor.index-microbatch.plist"
label="com.igor.index-microbatch"
dest="${launchagents_dir}/${label}.plist"

if [[ ! -f "${repo_root}/tools/index-microbatch.js" ]]; then
  echo "install-index-microbatch: FAIL — missing ${repo_root}/tools/index-microbatch.js" >&2
  exit 1
fi
if [[ ! -f "${template_src}" ]]; then
  echo "install-index-microbatch: FAIL — missing ${template_src}" >&2
  exit 1
fi

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
echo "  repo:  ${repo_root}"
echo "  plist: ${dest}"
echo "  log:   ${home}/Library/Logs/index-microbatch.log"
echo "  test:  node ${repo_root}/tools/index-microbatch.js --once --heal --json"
