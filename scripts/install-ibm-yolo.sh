#!/usr/bin/env bash
# Install official IBM Bob Shell and the ibm-yolo launcher on this Mac and hermes-mini.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REMOTE_HOST="${IBM_YOLO_REMOTE_HOST:-hermes-mini}"
INSTALL_REMOTE=1
REMOTE_ONLY=0
INSTALL_BOB=1
INSTALL_HOME="${IBM_YOLO_HOME:-$HOME}"
OFFICIAL_INSTALLER_URL="${IBM_BOBSHELL_INSTALLER_URL:-https://bob.ibm.com/download/bobshell.sh}"
EXPECTED_INSTALLER_SHA256="${IBM_BOBSHELL_INSTALLER_SHA256:-1a4db955c799777e38943bbed934fce8b63c1233743d21b32eb3755cce2f7057}"
TMP_DIR=""
OFFICIAL_INSTALLER_PATH=""

usage() {
  cat <<'EOF'
Usage: bash scripts/install-ibm-yolo.sh [options]

  --remote HOST       Install on HOST instead of hermes-mini
  --no-remote         Install only on this Mac
  --remote-only       Install only on the remote Mac
  --skip-bob-install  Deploy the wrapper without reinstalling Bob Shell
  -h, --help          Show this help

The installer downloads IBM's official bobshell.sh once, verifies its reviewed
SHA-256, and copies those exact bytes to the remote host. It does not activate a
paid plan, accept IBM's license, or persist authentication credentials.
EOF
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
    --remote-only)
      REMOTE_ONLY=1
      shift
      ;;
    --skip-bob-install)
      INSTALL_BOB=0
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "install-ibm-yolo: unknown argument: $1" >&2
      usage >&2
      exit 2
      ;;
  esac
done

cleanup() {
  [[ -z "$TMP_DIR" ]] || rm -rf "$TMP_DIR"
}
trap cleanup EXIT

sha256_file() {
  shasum -a 256 "$1" | awk '{print $1}'
}

fetch_official_installer() {
  TMP_DIR="$(mktemp -d "${TMPDIR:-/tmp}/ibm-yolo.XXXXXX")"
  OFFICIAL_INSTALLER_PATH="$TMP_DIR/bobshell.sh"
  curl -fsSL "$OFFICIAL_INSTALLER_URL" -o "$OFFICIAL_INSTALLER_PATH"
  chmod 0700 "$OFFICIAL_INSTALLER_PATH"

  local actual_sha
  actual_sha="$(sha256_file "$OFFICIAL_INSTALLER_PATH")"
  if [[ "$actual_sha" != "$EXPECTED_INSTALLER_SHA256" ]]; then
    echo "install-ibm-yolo: IBM installer hash mismatch" >&2
    echo "expected=$EXPECTED_INSTALLER_SHA256" >&2
    echo "actual=$actual_sha" >&2
    exit 1
  fi
}

deploy_local_wrapper() {
  local home_dir="$1"
  mkdir -p "$home_dir/.local/bin" "$home_dir/.local/share/ibm-yolo"
  install -m 0755 "$ROOT/ibm-yolo" "$home_dir/.local/share/ibm-yolo/ibm-yolo"
  ln -sfn "$home_dir/.local/share/ibm-yolo/ibm-yolo" "$home_dir/.local/bin/ibm-yolo"
}

verify_local() {
  local home_dir="$1"
  HOME="$home_dir" "$home_dir/.local/bin/ibm-yolo" --doctor --json
}

install_local() {
  local installer="${1:-}"
  if ((INSTALL_BOB)); then
    bash "$installer" --pm npm
  fi
  deploy_local_wrapper "$INSTALL_HOME"
  verify_local "$INSTALL_HOME"
}

install_remote() {
  local host="$1"
  local installer="${2:-}"
  local remote_wrapper="/tmp/ibm-yolo-wrapper.$$"
  local remote_installer="/tmp/ibm-bobshell-installer.$$"

  ssh -o BatchMode=yes -o ConnectTimeout=10 "$host" true
  scp -q "$ROOT/ibm-yolo" "$host:$remote_wrapper"
  if ((INSTALL_BOB)); then
    scp -q "$installer" "$host:$remote_installer"
    local remote_sha
    remote_sha="$(ssh -o BatchMode=yes -o ConnectTimeout=10 "$host" "shasum -a 256 '$remote_installer'" | awk '{print $1}')"
    if [[ "$remote_sha" != "$EXPECTED_INSTALLER_SHA256" ]]; then
      echo "install-ibm-yolo: remote IBM installer hash mismatch on $host" >&2
      return 1
    fi
    if ! ssh -o BatchMode=yes -o ConnectTimeout=10 "$host" \
      "export PATH=\"\$HOME/.npm-global/bin:\$HOME/.local/bin:/opt/homebrew/bin:/usr/local/bin:\$PATH\"; bash '$remote_installer' --pm npm"; then
      ssh -o BatchMode=yes -o ConnectTimeout=10 "$host" "rm -f '$remote_wrapper' '$remote_installer'" || true
      return 1
    fi
  fi

  ssh -o BatchMode=yes -o ConnectTimeout=10 "$host" \
    "set -eu
     mkdir -p \"\$HOME/.local/bin\" \"\$HOME/.local/share/ibm-yolo\"
     install -m 0755 '$remote_wrapper' \"\$HOME/.local/share/ibm-yolo/ibm-yolo\"
     ln -sfn \"\$HOME/.local/share/ibm-yolo/ibm-yolo\" \"\$HOME/.local/bin/ibm-yolo\"
     rm -f '$remote_wrapper' '$remote_installer'
     \"\$HOME/.local/bin/ibm-yolo\" --doctor --json"
}

installer=""
if ((INSTALL_BOB)); then
  fetch_official_installer
  installer="$OFFICIAL_INSTALLER_PATH"
fi

if ((REMOTE_ONLY == 0)); then
  install_local "$installer"
fi

if ((INSTALL_REMOTE)); then
  install_remote "$REMOTE_HOST" "$installer"
fi

echo "IBM_YOLO_INSTALL_OK local=$((REMOTE_ONLY == 0)) remote=$INSTALL_REMOTE remote_host=$REMOTE_HOST official_bob=$INSTALL_BOB"
