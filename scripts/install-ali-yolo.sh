#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REMOTE_HOST="${ALI_YOLO_REMOTE_HOST:-macmini}"
INSTALL_REMOTE=1
REMOTE_ONLY=0
INSTALL_HOME="${ALI_YOLO_HOME:-$HOME}"

usage() {
  cat <<'EOF'
Usage: bash scripts/install-ali-yolo.sh [options]

Installs Hermes Token Plan launcher as BOTH:
  ~/.local/bin/ali-yolo
  ~/.local/bin/ali          (Herdr "ali" tab uses this name)

  --remote HOST       Install on HOST instead of macmini
  --no-remote         Install only on this Mac
  --remote-only       Install only on the remote Mac
EOF
}

while (($#)); do
  case "$1" in
    --remote) REMOTE_HOST="${2:?--remote requires a host}"; shift 2 ;;
    --no-remote) INSTALL_REMOTE=0; shift ;;
    --remote-only) REMOTE_ONLY=1; shift ;;
    -h|--help) usage; exit 0 ;;
    *) echo "install-ali-yolo: unknown argument: $1" >&2; exit 2 ;;
  esac
done

deploy_local() {
  local home_dir="$1"
  mkdir -p "$home_dir/.local/bin" "$home_dir/.local/share/ali-yolo"
  install -m 0755 "$ROOT/ali-yolo-wrapper.js" "$home_dir/.local/share/ali-yolo/ali-yolo"
  ln -sfn "$home_dir/.local/share/ali-yolo/ali-yolo" "$home_dir/.local/bin/ali-yolo"
  # Herdr tabs named "ali" launch `ali`, not `ali-yolo` — keep them identical.
  install -m 0755 "$home_dir/.local/share/ali-yolo/ali-yolo" "$home_dir/.local/bin/ali"
}

verify_local() {
  local home_dir="$1"
  local status=0
  HOME="$home_dir" "$home_dir/.local/bin/ali" doctor --json || status=$?
  echo "ALI_YOLO_INSTALLED host=$(hostname -s) doctor_status=$status path=$home_dir/.local/bin/ali (also ali-yolo)"
}

if ((REMOTE_ONLY == 0)); then
  deploy_local "$INSTALL_HOME"
  verify_local "$INSTALL_HOME"
fi

if ((INSTALL_REMOTE)); then
  remote_wrapper="/tmp/ali-yolo-wrapper.$$"
  ssh -o BatchMode=yes -o ConnectTimeout=10 "$REMOTE_HOST" true
  scp -q "$ROOT/ali-yolo-wrapper.js" "$REMOTE_HOST:$remote_wrapper"
  ssh -o BatchMode=yes -o ConnectTimeout=10 "$REMOTE_HOST" \
    "set -eu
     mkdir -p \"\$HOME/.local/bin\" \"\$HOME/.local/share/ali-yolo\"
     install -m 0755 '$remote_wrapper' \"\$HOME/.local/share/ali-yolo/ali-yolo\"
     ln -sfn \"\$HOME/.local/share/ali-yolo/ali-yolo\" \"\$HOME/.local/bin/ali-yolo\"
     install -m 0755 \"\$HOME/.local/share/ali-yolo/ali-yolo\" \"\$HOME/.local/bin/ali\"
     rm -f '$remote_wrapper'
     doctor_status=0
     \"\$HOME/.local/bin/ali\" doctor --json || doctor_status=\$?
     echo \"ALI_YOLO_INSTALLED host=\$(hostname -s) doctor_status=\$doctor_status path=\$HOME/.local/bin/ali\""
fi
