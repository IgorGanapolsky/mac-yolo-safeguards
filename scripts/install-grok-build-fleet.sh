#!/usr/bin/env bash
# Install Grok Build open-source high-ROI fleet integration on this Mac + hermes-mini.
# - Merges local Ollama/LiteLLM model routes into ~/.grok/config.toml (managed block)
# - Installs PreToolUse safety + SessionStart receipt hooks
# - Does NOT change the default cloud model; does NOT copy secrets
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REMOTE_HOST="${GROK_BUILD_FLEET_REMOTE:-hermes-mini}"
INSTALL_REMOTE=1
CLONE_SOURCE=0
JSON=0

usage() {
  echo "Usage: bash scripts/install-grok-build-fleet.sh [--remote HOST|--no-remote] [--clone-source] [--json]"
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
    --clone-source)
      CLONE_SOURCE=1
      shift
      ;;
    --json)
      JSON=1
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "install-grok-build-fleet: unknown argument: $1" >&2
      usage >&2
      exit 1
      ;;
  esac
done

install_local_tools() {
  mkdir -p "$HOME/.hermes/grok-build-fleet" "$HOME/.local/bin"
  install -m 0755 "$ROOT/tools/grok-build-fleet.js" "$HOME/.hermes/grok-build-fleet/grok-build-fleet.js"
  # Hook assets stay in the repo path reference during install; the Node installer
  # copies them into ~/.grok/hooks from REPO_ROOT.
  ln -sfn "$HOME/.hermes/grok-build-fleet/grok-build-fleet.js" "$HOME/.local/bin/grok-build-fleet"
}

run_local_install() {
  # Point installer at this checkout so hook templates resolve.
  node "$ROOT/tools/grok-build-fleet.js" --install ${JSON:+--json}
}

install_remote() {
  local host="$1"
  ssh -o BatchMode=yes -o ConnectTimeout=10 "$host" 'mkdir -p "$HOME/.hermes/grok-build-fleet" "$HOME/.local/bin" "$HOME/.hermes/grok-build-fleet/repo/hooks" "$HOME/.hermes/grok-build-fleet/repo/tools"'
  rsync -a "$ROOT/tools/grok-build-fleet.js" "$host:~/.hermes/grok-build-fleet/grok-build-fleet.js"
  rsync -a "$ROOT/tools/grok-build-fleet.js" "$host:~/.hermes/grok-build-fleet/repo/tools/grok-build-fleet.js"
  rsync -a "$ROOT/hooks/grok-build-fleet/" "$host:~/.hermes/grok-build-fleet/repo/hooks/grok-build-fleet/"
  ssh -o BatchMode=yes -o ConnectTimeout=10 "$host" 'chmod 0755 "$HOME/.hermes/grok-build-fleet/grok-build-fleet.js"; ln -sfn "$HOME/.hermes/grok-build-fleet/grok-build-fleet.js" "$HOME/.local/bin/grok-build-fleet"; node "$HOME/.hermes/grok-build-fleet/repo/tools/grok-build-fleet.js" --install'
}

doctor_remote() {
  local host="$1"
  echo "=== Remote Grok Build fleet doctor ($host) ==="
  ssh -o BatchMode=yes -o ConnectTimeout=10 "$host" 'node "$HOME/.hermes/grok-build-fleet/grok-build-fleet.js" --doctor --json'
}

install_local_tools
echo "=== Local Grok Build fleet install ($(hostname)) ==="
run_local_install

if ((CLONE_SOURCE)); then
  echo "=== Cloning Grok Build source for local audit ==="
  node "$ROOT/tools/grok-build-fleet.js" --clone-source ${JSON:+--json} || true
fi

status=0
if ((INSTALL_REMOTE)); then
  echo "=== Remote Grok Build fleet install ($REMOTE_HOST) ==="
  if install_remote "$REMOTE_HOST"; then
    doctor_remote "$REMOTE_HOST" || status=2
  else
    echo "install-grok-build-fleet: remote install failed for $REMOTE_HOST" >&2
    status=2
  fi
fi

echo "=== Local doctor after install ==="
node "$ROOT/tools/grok-build-fleet.js" --doctor --json || status=2

if ((status != 0)); then
  echo "install-grok-build-fleet: completed with blockers (see doctors above)" >&2
  exit "$status"
fi

echo "install-grok-build-fleet: local and remote hosts ready"
