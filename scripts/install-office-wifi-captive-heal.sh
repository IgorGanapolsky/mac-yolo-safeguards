#!/usr/bin/env bash
# Install Office Evolution captive-portal heal LaunchAgent + optional sudoers.
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
home="${HOME}"
uid="$(id -u)"
gui_domain="gui/${uid}"
launchagents_dir="$home/Library/LaunchAgents"
local_bin="$home/.local/bin"
skip_launchctl="${OFFICE_WIFI_INSTALL_SKIP_LAUNCHCTL:-0}"
install_sudoers="${OFFICE_WIFI_INSTALL_SUDOERS:-1}"

mkdir -p "$local_bin" "$launchagents_dir" "$home/Library/Logs" "$home/Library/Caches/office-wifi-captive-heal"

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

install_script "$repo_root/scripts/office-wifi-captive-heal.sh" "$local_bin/office-wifi-captive-heal.sh"
install_script "$repo_root/scripts/office-wifi-privileged-helper.sh" "$local_bin/office-wifi-privileged-helper.sh"
render_plist "$repo_root/com.igor.office-wifi-captive-heal.plist" \
  "$launchagents_dir/com.igor.office-wifi-captive-heal.plist"

if grep -E '/private/tmp|actions-runner/_work|--dry-run' \
  "$launchagents_dir/com.igor.office-wifi-captive-heal.plist" >/dev/null; then
  echo "ERROR: unstable path or dry-run mode found in installed office wifi heal plist" >&2
  exit 1
fi

install_sudoers_dropin() {
  # Passwordless sudo ONLY for the captive-heal privileged helper script.
  # One GUI admin prompt via osascript; never stores the password.
  local dropin="/etc/sudoers.d/igor-office-wifi-captive-heal"
  local user helper
  user="$(/usr/bin/id -un)"
  helper="$local_bin/office-wifi-privileged-helper.sh"
  local body
  body=$(cat <<EOF
# mac-yolo-safeguards office-wifi-captive-heal — narrow NOPASSWD (helper only)
${user} ALL=(root) NOPASSWD: ${helper}
EOF
)

  if [[ "${OFFICE_WIFI_INSTALL_SKIP_SUDOERS_PROMPT:-0}" == "1" ]]; then
    echo "SUDOERS skipped (OFFICE_WIFI_INSTALL_SKIP_SUDOERS_PROMPT=1)"
    return 0
  fi

  if /usr/bin/sudo -n /usr/bin/true >/dev/null 2>&1; then
    printf '%s\n' "$body" | /usr/bin/sudo -n /usr/bin/tee "$dropin" >/dev/null
    /usr/bin/sudo -n /bin/chmod 0440 "$dropin"
    /usr/bin/sudo -n /usr/sbin/visudo -cf "$dropin" >/dev/null
    echo "SUDOERS installed: $dropin -> $helper"
    return 0
  fi

  local tmp
  tmp="$(mktemp)"
  printf '%s\n' "$body" > "$tmp"
  if /usr/bin/osascript <<OSA
do shell script "cp '$tmp' '$dropin' && chmod 0440 '$dropin' && visudo -cf '$dropin'" with administrator privileges
OSA
  then
    rm -f "$tmp"
    echo "SUDOERS installed via admin prompt: $dropin"
  else
    rm -f "$tmp"
    echo "SUDOERS prompt cancelled or failed — soft heal still works via networksetup bounce + Captive Assistant" >&2
  fi
}

if [[ "$install_sudoers" == "1" ]]; then
  install_sudoers_dropin || true
fi

if [[ "$skip_launchctl" != "1" ]]; then
  label="com.igor.office-wifi-captive-heal"
  launchctl bootout "$gui_domain/$label" 2>/dev/null || true
  launchctl bootstrap "$gui_domain" "$launchagents_dir/$label.plist"
  launchctl enable "$gui_domain/$label" 2>/dev/null || true
  launchctl kickstart -k "$gui_domain/$label"
fi

printf 'INSTALLED %s sha256=%s\n' \
  "$local_bin/office-wifi-captive-heal.sh" \
  "$(shasum -a 256 "$local_bin/office-wifi-captive-heal.sh" | awk '{print $1}')"
printf 'LaunchAgent: com.igor.office-wifi-captive-heal (60s + RunAtLoad)\n'
printf 'Hard rules: never deletes preferences.plist; never auto-reboots\n'
