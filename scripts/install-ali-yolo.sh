#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REMOTE_HOST="${ALI_YOLO_REMOTE_HOST:-macmini}"
INSTALL_REMOTE=1
REMOTE_ONLY=0
INSTALL_QWEN=1
INSTALL_HOME="${ALI_YOLO_HOME:-$HOME}"
QWEN_PACKAGE="@qwen-code/qwen-code@0.19.10"

usage() {
  cat <<'EOF'
Usage: bash scripts/install-ali-yolo.sh [options]

  --remote HOST       Install on HOST instead of macmini
  --no-remote         Install only on this Mac
  --remote-only       Install only on the remote Mac
  --skip-qwen-install Deploy wrapper without npm install
EOF
}

while (($#)); do
  case "$1" in
    --remote) REMOTE_HOST="${2:?--remote requires a host}"; shift 2 ;;
    --no-remote) INSTALL_REMOTE=0; shift ;;
    --remote-only) REMOTE_ONLY=1; shift ;;
    --skip-qwen-install) INSTALL_QWEN=0; shift ;;
    -h|--help) usage; exit 0 ;;
    *) echo "install-ali-yolo: unknown argument: $1" >&2; exit 2 ;;
  esac
done

deploy_local() {
  local home_dir="$1"
  mkdir -p "$home_dir/.local/bin" "$home_dir/.local/share/ali-yolo"
  install -m 0755 "$ROOT/ali-yolo-wrapper.js" "$home_dir/.local/share/ali-yolo/ali-yolo"
  ln -sfn "$home_dir/.local/share/ali-yolo/ali-yolo" "$home_dir/.local/bin/ali-yolo"
}

verify_local() {
  local home_dir="$1"
  local status=0
  HOME="$home_dir" "$home_dir/.local/bin/ali-yolo" --doctor --json || status=$?
  echo "ALI_YOLO_INSTALLED host=$(hostname -s) doctor_status=$status path=$home_dir/.local/bin/ali-yolo"
}

if ((REMOTE_ONLY == 0)); then
  if ((INSTALL_QWEN)); then npm install -g "$QWEN_PACKAGE"; fi
  deploy_local "$INSTALL_HOME"
  verify_local "$INSTALL_HOME"
fi

if ((INSTALL_REMOTE)); then
  remote_wrapper="/tmp/ali-yolo-wrapper.$$"
  ssh -o BatchMode=yes -o ConnectTimeout=10 "$REMOTE_HOST" true
  scp -q "$ROOT/ali-yolo-wrapper.js" "$REMOTE_HOST:$remote_wrapper"
  ssh -o BatchMode=yes -o ConnectTimeout=10 "$REMOTE_HOST" \
    "set -eu
     export PATH=\"\$HOME/.npm-global/bin:/opt/homebrew/bin:/usr/local/bin:\$PATH\"
     if [ '$INSTALL_QWEN' -eq 1 ]; then npm install -g '$QWEN_PACKAGE'; fi
     mkdir -p \"\$HOME/.local/bin\" \"\$HOME/.local/share/ali-yolo\"
     install -m 0755 '$remote_wrapper' \"\$HOME/.local/share/ali-yolo/ali-yolo\"
     ln -sfn \"\$HOME/.local/share/ali-yolo/ali-yolo\" \"\$HOME/.local/bin/ali-yolo\"
     rm -f '$remote_wrapper'
     doctor_status=0
     \"\$HOME/.local/bin/ali-yolo\" --doctor --json || doctor_status=\$?
     echo \"ALI_YOLO_INSTALLED host=\$(hostname -s) doctor_status=\$doctor_status path=\$HOME/.local/bin/ali-yolo\""
fi
