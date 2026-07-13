#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REMOTE_HOST="${COCO_YOLO_REMOTE_HOST:-hermes-mini}"
INSTALL_REMOTE=1

usage() {
  echo "Usage: bash scripts/install-coco-yolo.sh [--remote HOST|--no-remote]"
}

while (($#)); do
  case "$1" in
    --remote)
      REMOTE_HOST="${2:?--remote requires a host}"
      shift 2
      ;;
    --no-remote)
      INSTALL_REMOTE=0
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "install-coco-yolo: unknown argument: $1" >&2
      usage >&2
      exit 1
      ;;
  esac
done

require_local_runtime() {
  command -v cortex >/dev/null 2>&1 || {
    echo "install-coco-yolo: Cortex Code is not installed locally" >&2
    return 1
  }
  command -v snow >/dev/null 2>&1 || {
    echo "install-coco-yolo: Snowflake CLI is not installed locally" >&2
    return 1
  }
}

install_local_files() {
  mkdir -p "$HOME/.hermes/coco/tools" "$HOME/.local/bin"
  install -m 0755 "$ROOT/coco-yolo-wrapper.js" "$HOME/.hermes/coco/coco-yolo-wrapper.js"
  install -m 0755 "$ROOT/hermes-yolo-wrapper.js" "$HOME/.hermes/hermes-yolo-wrapper.js"
  install -m 0755 "$ROOT/tools/hermes-coco-harness.js" "$HOME/.hermes/coco/tools/hermes-coco-harness.js"
  ln -sfn "$HOME/.hermes/coco/coco-yolo-wrapper.js" "$HOME/.local/bin/coco-yolo"
  ln -sfn "$HOME/.hermes/hermes-yolo-wrapper.js" "$HOME/.local/bin/hermes-yolo"
  ln -sfn "$HOME/.hermes/coco/tools/hermes-coco-harness.js" "$HOME/.local/bin/hermes-coco"
}

require_remote_runtime() {
  local host="$1"
  ssh -o BatchMode=yes -o ConnectTimeout=8 "$host" \
    'command -v cortex >/dev/null 2>&1 && command -v snow >/dev/null 2>&1'
}

install_remote_files() {
  local host="$1"
  ssh -o BatchMode=yes -o ConnectTimeout=8 "$host" \
    'mkdir -p "$HOME/.hermes/coco/tools" "$HOME/.local/bin"'
  rsync -a "$ROOT/coco-yolo-wrapper.js" "$host:~/.hermes/coco/coco-yolo-wrapper.js"
  rsync -a "$ROOT/hermes-yolo-wrapper.js" "$host:~/.hermes/hermes-yolo-wrapper.js"
  rsync -a "$ROOT/tools/hermes-coco-harness.js" "$host:~/.hermes/coco/tools/hermes-coco-harness.js"
  ssh -o BatchMode=yes -o ConnectTimeout=8 "$host" \
    'chmod 0755 "$HOME/.hermes/coco/coco-yolo-wrapper.js" "$HOME/.hermes/hermes-yolo-wrapper.js" "$HOME/.hermes/coco/tools/hermes-coco-harness.js"; ln -sfn "$HOME/.hermes/coco/coco-yolo-wrapper.js" "$HOME/.local/bin/coco-yolo"; ln -sfn "$HOME/.hermes/hermes-yolo-wrapper.js" "$HOME/.local/bin/hermes-yolo"; ln -sfn "$HOME/.hermes/coco/tools/hermes-coco-harness.js" "$HOME/.local/bin/hermes-coco"'
}

doctor_local() {
  echo "Local CoCo doctor ($(hostname))"
  "$HOME/.local/bin/coco-yolo" --doctor --json
  "$HOME/.local/bin/hermes-coco" --task "Snowflake: verify the automatic Hermes route" --json
}

doctor_remote() {
  local host="$1"
  echo "Remote CoCo doctor ($host)"
  ssh -o BatchMode=yes -o ConnectTimeout=8 "$host" \
    '"$HOME/.local/bin/coco-yolo" --doctor --json; "$HOME/.local/bin/hermes-coco" --task "Snowflake: verify the automatic Hermes route" --json'
}

verify_hash_parity() {
  local host="$1"
  local local_hashes remote_hashes
  local_hashes="$(shasum -a 256 \
    "$HOME/.hermes/coco/coco-yolo-wrapper.js" \
    "$HOME/.hermes/hermes-yolo-wrapper.js" \
    "$HOME/.hermes/coco/tools/hermes-coco-harness.js" | cut -d ' ' -f 1)"
  remote_hashes="$(ssh -o BatchMode=yes -o ConnectTimeout=8 "$host" \
    'shasum -a 256 "$HOME/.hermes/coco/coco-yolo-wrapper.js" "$HOME/.hermes/hermes-yolo-wrapper.js" "$HOME/.hermes/coco/tools/hermes-coco-harness.js" | cut -d " " -f 1')"
  if [[ "$local_hashes" != "$remote_hashes" ]]; then
    echo "install-coco-yolo: local/remote executable hashes differ" >&2
    return 1
  fi
  echo "install-coco-yolo: local/remote executable hashes match"
}

require_local_runtime
install_local_files

if ((INSTALL_REMOTE)); then
  require_remote_runtime "$REMOTE_HOST"
  install_remote_files "$REMOTE_HOST"
fi

doctor_local
if ((INSTALL_REMOTE)); then
  doctor_remote "$REMOTE_HOST"
  verify_hash_parity "$REMOTE_HOST"
fi

echo "install-coco-yolo: dedicated CoCo CLI and automatic Hermes Snowflake route installed"
