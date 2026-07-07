#!/bin/bash
# Enable macOS Remote Login (sshd) so this Mac is reachable as a Hermes fleet node
# over Tailscale — fixes "SSH refused" when another node (e.g. the Mac mini) tries to
# reach this machine to deploy/manage the redundant gateway.
#
# Idempotent: safe to re-run. Must run as root, e.g.:
#   sudo bash scripts/hermes-enable-remote-login.sh
#   osascript -e 'do shell script "bash .../hermes-enable-remote-login.sh" with administrator privileges'
set -uo pipefail

if [ "$(id -u)" -ne 0 ]; then
  echo "hermes-enable-remote-login: must run as root" >&2
  exit 2
fi

# Preferred path: systemsetup also wires the com.apple.access_ssh ACL. Newer macOS
# restricts this toggle to callers with Full Disk Access; if so, fall back to
# bootstrapping the ssh LaunchDaemon directly (same end state: sshd listening on 22).
out="$(/usr/sbin/systemsetup -setremotelogin on 2>&1 || true)"
if printf '%s' "$out" | grep -qi "Full Disk Access"; then
  echo "hermes-enable-remote-login: systemsetup needs FDA -> bootstrapping ssh LaunchDaemon"
  /bin/launchctl enable system/com.openssh.sshd 2>/dev/null || true
  /bin/launchctl bootstrap system /System/Library/LaunchDaemons/ssh.plist 2>/dev/null || true
fi

# Ground-truth verification (not just the toggle's word for it).
listening="$(/usr/sbin/lsof -nP -iTCP:22 -sTCP:LISTEN 2>/dev/null | grep -c LISTEN || true)"
printf 'remote-login-setting: %s\n' "$(/usr/sbin/systemsetup -getremotelogin 2>&1)"
printf 'listeners-on-22: %s\n' "${listening:-0}"

if [ "${listening:-0}" -ge 1 ]; then
  echo "hermes-enable-remote-login: OK — sshd is listening on port 22"
  exit 0
fi
echo "hermes-enable-remote-login: FAILED — nothing listening on 22 (grant Terminal Full Disk Access or check ssh.plist)" >&2
exit 1
