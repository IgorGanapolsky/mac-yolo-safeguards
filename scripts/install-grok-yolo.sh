#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REMOTE_HOST="${GROK_YOLO_REMOTE_HOST:-hermes-mini}"
INSTALL_REMOTE=1
UPDATE_GROK=0

usage() {
  echo "Usage: bash scripts/install-grok-yolo.sh [--remote HOST|--no-remote] [--update]"
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
    --update)
      UPDATE_GROK=1
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "install-grok-yolo: unknown argument: $1" >&2
      usage >&2
      exit 1
      ;;
  esac
done

install_local_files() {
  mkdir -p "$HOME/.hermes/grok45/tools" "$HOME/.local/bin"
  install -m 0755 "$ROOT/grok-yolo-wrapper.js" "$HOME/.hermes/grok45/grok-yolo-wrapper.js"
  install -m 0755 "$ROOT/hermes-yolo-wrapper.js" "$HOME/.hermes/hermes-yolo-wrapper.js"
  install -m 0755 "$ROOT/tools/hermes-grok45-harness.js" "$HOME/.hermes/grok45/tools/hermes-grok45-harness.js"
  install -m 0755 "$ROOT/tools/hermes-harness-eval.js" "$HOME/.hermes/grok45/tools/hermes-harness-eval.js"
  install -m 0755 "$ROOT/tools/hermes-parallel-search.js" "$HOME/.hermes/grok45/tools/hermes-parallel-search.js"
  ln -sfn "$HOME/.hermes/grok45/grok-yolo-wrapper.js" "$HOME/.local/bin/grok-yolo"
  ln -sfn "$HOME/.hermes/hermes-yolo-wrapper.js" "$HOME/.local/bin/hermes-yolo"
  ln -sfn "$HOME/.hermes/grok45/tools/hermes-grok45-harness.js" "$HOME/.local/bin/hermes-grok45"
  ln -sfn "$HOME/.hermes/grok45/tools/hermes-harness-eval.js" "$HOME/.local/bin/hermes-harness-eval"
  ln -sfn "$HOME/.hermes/grok45/tools/hermes-parallel-search.js" "$HOME/.local/bin/hermes-parallel-search"
}

update_local_grok() {
  local grok_bin
  grok_bin="$(command -v grok 2>/dev/null || true)"
  if [[ -z "$grok_bin" ]]; then
    echo "install-grok-yolo: local Grok Build binary is missing" >&2
    return 1
  fi
  "$grok_bin" update
}

install_remote_files() {
  local host="$1"
  ssh -o BatchMode=yes -o ConnectTimeout=8 "$host" 'mkdir -p "$HOME/.hermes/grok45/tools" "$HOME/.local/bin"'
  rsync -a "$ROOT/grok-yolo-wrapper.js" "$host:~/.hermes/grok45/grok-yolo-wrapper.js"
  rsync -a "$ROOT/hermes-yolo-wrapper.js" "$host:~/.hermes/hermes-yolo-wrapper.js"
  rsync -a "$ROOT/tools/hermes-grok45-harness.js" "$host:~/.hermes/grok45/tools/hermes-grok45-harness.js"
  rsync -a "$ROOT/tools/hermes-harness-eval.js" "$host:~/.hermes/grok45/tools/hermes-harness-eval.js"
  rsync -a "$ROOT/tools/hermes-parallel-search.js" "$host:~/.hermes/grok45/tools/hermes-parallel-search.js"
  ssh -o BatchMode=yes -o ConnectTimeout=8 "$host" 'chmod 0755 "$HOME/.hermes/grok45/grok-yolo-wrapper.js" "$HOME/.hermes/hermes-yolo-wrapper.js" "$HOME/.hermes/grok45/tools/hermes-grok45-harness.js" "$HOME/.hermes/grok45/tools/hermes-harness-eval.js" "$HOME/.hermes/grok45/tools/hermes-parallel-search.js"; ln -sfn "$HOME/.hermes/grok45/grok-yolo-wrapper.js" "$HOME/.local/bin/grok-yolo"; ln -sfn "$HOME/.hermes/hermes-yolo-wrapper.js" "$HOME/.local/bin/hermes-yolo"; ln -sfn "$HOME/.hermes/grok45/tools/hermes-grok45-harness.js" "$HOME/.local/bin/hermes-grok45"; ln -sfn "$HOME/.hermes/grok45/tools/hermes-harness-eval.js" "$HOME/.local/bin/hermes-harness-eval"; ln -sfn "$HOME/.hermes/grok45/tools/hermes-parallel-search.js" "$HOME/.local/bin/hermes-parallel-search"'
}

update_remote_grok() {
  local host="$1"
  ssh -o BatchMode=yes -o ConnectTimeout=8 "$host" 'grok_bin="$(command -v grok 2>/dev/null || true)"; if [ -z "$grok_bin" ]; then echo "install-grok-yolo: remote Grok Build binary is missing" >&2; exit 1; fi; "$grok_bin" update'
}

doctor_local() {
  echo "=== Local Grok 4.5 doctor ($(hostname)) ==="
  "$HOME/.local/bin/grok-yolo" --doctor --json
}

doctor_remote() {
  local host="$1"
  echo "=== Remote Grok 4.5 doctor ($host) ==="
  ssh -o BatchMode=yes -o ConnectTimeout=8 "$host" '"$HOME/.local/bin/grok-yolo" --doctor --json'
}

install_local_files
if ((UPDATE_GROK)); then
  update_local_grok
fi

if ((INSTALL_REMOTE)); then
  install_remote_files "$REMOTE_HOST"
  if ((UPDATE_GROK)); then
    update_remote_grok "$REMOTE_HOST"
  fi
fi

doctor_status=0
doctor_local || doctor_status=2
if ((INSTALL_REMOTE)); then
  doctor_remote "$REMOTE_HOST" || doctor_status=2
fi

if ((doctor_status != 0)); then
  echo "install-grok-yolo: files installed, but at least one host still has a version/auth/model blocker" >&2
  exit "$doctor_status"
fi

echo "install-grok-yolo: local and remote Grok 4.5 harnesses are ready"
