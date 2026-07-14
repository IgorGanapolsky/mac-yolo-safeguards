#!/usr/bin/env bash
# Register Mac mini as a GitHub Actions self-hosted runner for mac-yolo-safeguards.
# Does not print registration tokens. See docs/GITHUB-MAC-MINI-RUNNER.md.
set -euo pipefail

repo="${GITHUB_REPO:-IgorGanapolsky/mac-yolo-safeguards}"
runner_name="${RUNNER_NAME:-mac-mini-hermes}"
runner_dir="${RUNNER_DIR:-${HOME}/actions-runner}"
runner_version="${RUNNER_VERSION:-2.327.1}"
mini_tsip="${HERMES_MINI_TSIP:-100.94.135.78}"
mini_ssh_user="${HERMES_MINI_SSH_USER:-igorganapolsky}"
labels="self-hosted,macOS,macos-arm64,mac-mini,hermes-e2e"
remote=0

usage() {
  cat <<EOF
Usage: bash scripts/register-github-mac-mini-runner.sh [--remote]

  --remote   SSH to Mac mini at HERMES_MINI_TSIP and install there

Env: GITHUB_REPO, RUNNER_NAME, RUNNER_DIR, GITHUB_RUNNER_REGISTRATION_TOKEN,
     HERMES_MINI_TSIP, HERMES_MINI_SSH_USER, RUNNER_VERSION
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --remote) remote=1; shift ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unknown arg: $1" >&2; usage; exit 1 ;;
  esac
done

fetch_registration_token() {
  if [[ -n "${GITHUB_RUNNER_REGISTRATION_TOKEN:-}" ]]; then
    printf '%s' "$GITHUB_RUNNER_REGISTRATION_TOKEN"
    return 0
  fi
  if ! command -v gh >/dev/null 2>&1; then
    echo "gh CLI required to fetch registration token (or set GITHUB_RUNNER_REGISTRATION_TOKEN)" >&2
    exit 1
  fi
  gh api -X POST "repos/${repo}/actions/runners/registration-token" --jq .token
}

install_runner_local() {
  local token="$1"
  local archive="actions-runner-osx-arm64-${runner_version}.tar.gz"
  local url="https://github.com/actions/runner/releases/download/v${runner_version}/${archive}"

  mkdir -p "$runner_dir"
  cd "$runner_dir"

  if [[ ! -f "./config.sh" ]]; then
    echo "Downloading actions-runner v${runner_version} ..."
    curl -fsSL "$url" -o "$archive"
    tar xzf "$archive"
    rm -f "$archive"
  fi

  if [[ -f ".runner" ]]; then
    echo "Runner already configured in $runner_dir — re-registering with --replace"
    ./config.sh remove --unattended 2>/dev/null || true
  fi

  ./config.sh \
    --url "https://github.com/${repo}" \
    --token "$token" \
    --name "$runner_name" \
    --labels "$labels" \
    --unattended \
    --replace

  uid="$(id -u)"
  gui_domain="gui/${uid}"
  plist_label="com.igor.github-actions-runner"
  plist_path="${HOME}/Library/LaunchAgents/${plist_label}.plist"
  log_dir="${HOME}/Library/Logs/mac-yolo"
  mkdir -p "$log_dir" "${HOME}/Library/LaunchAgents"

  cat >"$plist_path" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${plist_label}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${runner_dir}/run.sh</string>
  </array>
  <key>WorkingDirectory</key>
  <string>${runner_dir}</string>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>StandardOutPath</key>
  <string>${log_dir}/github-actions-runner.log</string>
  <key>StandardErrorPath</key>
  <string>${log_dir}/github-actions-runner.err.log</string>
</dict>
</plist>
PLIST

  launchctl bootout "${gui_domain}/${plist_label}" 2>/dev/null || true
  launchctl bootstrap "$gui_domain" "$plist_path"
  launchctl enable "${gui_domain}/${plist_label}" 2>/dev/null || true
  launchctl kickstart -k "${gui_domain}/${plist_label}" 2>/dev/null || true

  echo "OK runner ${runner_name} registered in ${runner_dir}"
  echo "Logs: ${log_dir}/github-actions-runner.log"
}

print_runners() {
  if command -v gh >/dev/null 2>&1; then
    echo "Runners:"
    gh api "repos/${repo}/actions/runners" \
      --jq '.runners[] | {name, status, busy, labels: [.labels[].name]}' 2>/dev/null || true
  fi
}

token="$(fetch_registration_token)"
if [[ -z "$token" ]]; then
  echo "Empty registration token — need repo admin + gh auth" >&2
  exit 1
fi

if [[ "$remote" -eq 1 ]]; then
  echo "Installing runner on Mac mini (${mini_ssh_user}@${mini_tsip}) ..."
  ssh -o BatchMode=yes -o ConnectTimeout=15 "${mini_ssh_user}@${mini_tsip}" \
    "GITHUB_RUNNER_REGISTRATION_TOKEN='${token}' GITHUB_REPO='${repo}' RUNNER_NAME='${runner_name}' RUNNER_DIR='${runner_dir}' RUNNER_VERSION='${runner_version}' bash -c '
set -euo pipefail
repo=\"\${GITHUB_REPO}\"
runner_name=\"\${RUNNER_NAME}\"
runner_dir=\"\${RUNNER_DIR}\"
runner_version=\"\${RUNNER_VERSION}\"
labels=\"self-hosted,macOS,macos-arm64,mac-mini,hermes-e2e\"
archive=\"actions-runner-osx-arm64-\${runner_version}.tar.gz\"
url=\"https://github.com/actions/runner/releases/download/v\${runner_version}/\${archive}\"
mkdir -p \"\${runner_dir}\" && cd \"\${runner_dir}\"
if [[ ! -f ./config.sh ]]; then curl -fsSL \"\${url}\" -o \"\${archive}\" && tar xzf \"\${archive}\" && rm -f \"\${archive}\"; fi
[[ -f .runner ]] && ./config.sh remove --unattended 2>/dev/null || true
./config.sh --url \"https://github.com/\${repo}\" --token \"\${GITHUB_RUNNER_REGISTRATION_TOKEN}\" --name \"\${runner_name}\" --labels \"\${labels}\" --unattended --replace
uid=\$(id -u); gui=\"gui/\${uid}\"; label=com.igor.github-actions-runner
log_dir=\"\${HOME}/Library/Logs/mac-yolo\"; mkdir -p \"\${log_dir}\" \"\${HOME}/Library/LaunchAgents\"
cat >\"\${HOME}/Library/LaunchAgents/\${label}.plist\" <<PLIST
<?xml version=\"1.0\" encoding=\"UTF-8\"?>
<!DOCTYPE plist PUBLIC \"-//Apple//DTD PLIST 1.0//EN\" \"http://www.apple.com/DTDs/PropertyList-1.0.dtd\">
<plist version=\"1.0\"><dict>
<key>Label</key><string>\${label}</string>
<key>ProgramArguments</key><array><string>\${runner_dir}/run.sh</string></array>
<key>WorkingDirectory</key><string>\${runner_dir}</string>
<key>RunAtLoad</key><true/><key>KeepAlive</key><true/>
<key>StandardOutPath</key><string>\${log_dir}/github-actions-runner.log</string>
<key>StandardErrorPath</key><string>\${log_dir}/github-actions-runner.err.log</string>
</dict></plist>
PLIST
launchctl bootout \"\${gui}/\${label}\" 2>/dev/null || true
launchctl bootstrap \"\${gui}\" \"\${HOME}/Library/LaunchAgents/\${label}.plist\"
launchctl enable \"\${gui}/\${label}\" 2>/dev/null || true
launchctl kickstart -k \"\${gui}/\${label}\" 2>/dev/null || true
echo OK runner \${runner_name} on \$(hostname)
'"
else
  install_runner_local "$token"
fi

print_runners
