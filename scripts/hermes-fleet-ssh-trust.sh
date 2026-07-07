#!/bin/bash
# Establish passwordless SSH between Hermes fleet Macs over Tailscale.
#
# Tailscale is the encrypted transport + stable identity (100.x IPs). macOS sshd is
# the server (Remote Login). App Store / standalone Tailscale GUI builds CANNOT run
# the Tailscale SSH server (Apple sandbox) — official workaround is sshd + keys.
#
# Idempotent: safe to re-run. Never prints private key material.
#
# Usage (from any fleet Mac that can reach peers over Tailscale):
#   bash scripts/hermes-fleet-ssh-trust.sh
#   bash scripts/hermes-fleet-ssh-trust.sh --mini 100.94.135.78 --mbp 100.87.85.85
set -uo pipefail

MINI="${HERMES_MINI_TSIP:-100.94.135.78}"
MBP="${HERMES_MBP_TSIP:-100.87.85.85}"
SSH_DIR="${HOME}/.ssh"
CONFIG="${SSH_DIR}/config"
USER_NAME="${USER}"

while [ $# -gt 0 ]; do
  case "$1" in
    --mini) MINI="$2"; shift 2 ;;
    --mbp)  MBP="$2";  shift 2 ;;
    *) echo "unknown arg: $1" >&2; exit 2 ;;
  esac
done

mkdir -p "$SSH_DIR" && chmod 700 "$SSH_DIR"
[ -f "${SSH_DIR}/id_ed25519" ] || ssh-keygen -t ed25519 -N "" -f "${SSH_DIR}/id_ed25519" -q

install_pubkey() {
  # install_pubkey <remote_host> <local_authorized_keys>
  local host="$1" auth="$2"
  touch "$auth" && chmod 600 "$auth"
  ssh -o BatchMode=yes -o ConnectTimeout=8 "$host" \
    '[ -f ~/.ssh/id_ed25519.pub ] || ssh-keygen -t ed25519 -N "" -f ~/.ssh/id_ed25519 -q; cat ~/.ssh/id_ed25519.pub' \
    > "${auth}.remote.tmp"
  local blob
  blob="$(awk '{print $2}' "${auth}.remote.tmp")"
  if grep -qF "$blob" "$auth" 2>/dev/null; then
    echo "  already trusted: $host"
  else
    cat "${auth}.remote.tmp" >> "$auth"
    echo "  installed pubkey from: $host"
  fi
  rm -f "${auth}.remote.tmp"
}

seed_known_host() {
  # seed_known_host <remote_shell_host> <target_ip>
  local via="$1" target="$2"
  ssh -o BatchMode=yes -o ConnectTimeout=8 "$via" \
    "mkdir -p ~/.ssh && chmod 700 ~/.ssh && touch ~/.ssh/known_hosts && chmod 600 ~/.ssh/known_hosts && ssh-keyscan -H '$target' 2>/dev/null >> ~/.ssh/known_hosts"
  echo "  seeded known_hosts on $via for $target"
}

write_config_block() {
  local marker="# hermes-fleet-tailscale (managed by scripts/hermes-fleet-ssh-trust.sh)"
  if grep -qF "$marker" "$CONFIG" 2>/dev/null; then
    echo "  ssh config block already present"
    return
  fi
  touch "$CONFIG" && chmod 600 "$CONFIG"
  cat >> "$CONFIG" <<EOF

$marker
Host hermes-mini hermes-mac-mini
  HostName $MINI
  User $USER_NAME
  IdentityFile ~/.ssh/id_ed25519
  StrictHostKeyChecking accept-new

Host hermes-mbp hermes-macbook-pro
  HostName $MBP
  User $USER_NAME
  IdentityFile ~/.ssh/id_ed25519
  StrictHostKeyChecking accept-new
EOF
  echo "  wrote fleet Host entries (hermes-mini, hermes-mbp)"
}

echo "=== hermes-fleet-ssh-trust ==="
echo "mini tailscale: $MINI"
echo "mbp  tailscale: $MBP"

# Detect which machine we're on by matching tailscale self IP.
SELF="$(/Applications/Tailscale.app/Contents/MacOS/Tailscale ip -4 2>/dev/null | head -1 || true)"
echo "this machine:   ${SELF:-unknown}"

AUTH="${SSH_DIR}/authorized_keys"

if [ "$SELF" = "$MBP" ]; then
  echo "[1/3] MBP: trust mini pubkey (mini -> MBP passwordless)"
  install_pubkey "$MINI" "$AUTH"
  echo "[1b/3] mini: seed MBP host key (fixes host key verification on first hop)"
  seed_known_host "$MINI" "$MBP"
  echo "[1c/3] mini: sync fleet ssh config block"
  ssh -o BatchMode=yes -o ConnectTimeout=8 "$MINI" "grep -qF 'hermes-fleet-tailscale' ~/.ssh/config 2>/dev/null" \
    || ssh -o BatchMode=yes -o ConnectTimeout=8 "$MINI" "mkdir -p ~/.ssh && chmod 700 ~/.ssh && cat >> ~/.ssh/config" <<EOF

# hermes-fleet-tailscale (managed by scripts/hermes-fleet-ssh-trust.sh)
Host hermes-mini hermes-mac-mini
  HostName $MINI
  User $USER_NAME
  IdentityFile ~/.ssh/id_ed25519
  StrictHostKeyChecking accept-new

Host hermes-mbp hermes-macbook-pro
  HostName $MBP
  User $USER_NAME
  IdentityFile ~/.ssh/id_ed25519
  StrictHostKeyChecking accept-new
EOF
  echo "  synced fleet config to mini"
elif [ "$SELF" = "$MINI" ]; then
  echo "[1/3] mini: trust MBP pubkey (MBP -> mini already; ensure reverse)"
  install_pubkey "$MBP" "$AUTH"
else
  echo "[1/3] unknown self IP — trusting both directions from this jump host"
  install_pubkey "$MINI" "$AUTH"
  install_pubkey "$MBP" "$AUTH"
fi

echo "[2/3] fleet ssh config"
write_config_block

echo "[3/3] connectivity proof (BatchMode, over Tailscale)"
fail=0
if ssh -o BatchMode=yes -o ConnectTimeout=8 "$MINI" \
  "ssh -o BatchMode=yes -o ConnectTimeout=8 -o StrictHostKeyChecking=yes $MBP 'echo MINI_TO_MBP_OK'" 2>/dev/null | grep -q MINI_TO_MBP_OK; then
  echo "  PASS mini -> MBP"
else
  echo "  FAIL mini -> MBP" >&2
  fail=1
fi
if ssh -o BatchMode=yes -o ConnectTimeout=8 "$MINI" 'echo MBP_TO_MINI_OK' 2>/dev/null | grep -q MBP_TO_MINI_OK; then
  echo "  PASS MBP -> mini"
else
  echo "  FAIL MBP -> mini" >&2
  fail=1
fi

echo "=== done (authorized_keys entries: $(grep -c . "$AUTH" 2>/dev/null || echo 0)) ==="
exit "$fail"
