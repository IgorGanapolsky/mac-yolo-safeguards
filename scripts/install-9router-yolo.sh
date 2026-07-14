#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VERSION="0.5.30"
INTEGRITY="sha512-1JsqzRuawrS6b4Fqw15/vhIWjH179ehGQXuvQiTnvPksXG8jbtS26lVyBOy6VXkRVZC3WRWpyhDVNQy2DOgYlw=="
EXPECTED_SHA512="${INTEGRITY#sha512-}"
REMOTE_HOST="${NINE_ROUTER_REMOTE_HOST:-hermes-mini}"
INSTALL_LOCAL=1
INSTALL_REMOTE=1
TARBALL="${NINE_ROUTER_TARBALL:-}"
TEMP_DIR=""

usage() {
  cat <<'USAGE'
Usage: bash scripts/install-9router-yolo.sh [options]
  --remote HOST       Deploy the identical package and wrappers to HOST
  --no-remote         Install only on this Mac
  --remote-only       Install only on the remote Mac
  --tarball PATH      Use a pre-downloaded 9router package (integrity still checked)

The installer never runs npm lifecycle scripts, opens a browser, enables a
tunnel/MITM bridge, changes hermes-yolo, migrates credentials, or adds autostart.
USAGE
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
      INSTALL_LOCAL=0
      shift
      ;;
    --tarball)
      TARBALL="${2:?--tarball requires a path}"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "install-9router-yolo: unknown argument: $1" >&2
      usage >&2
      exit 2
      ;;
  esac
done

cleanup() {
  if [[ -n "$TEMP_DIR" && -d "$TEMP_DIR" ]]; then
    rm -rf "$TEMP_DIR"
  fi
}
trap cleanup EXIT

require_tools() {
  local tool
  for tool in node npm openssl shasum; do
    command -v "$tool" >/dev/null 2>&1 || {
      echo "install-9router-yolo: missing required tool: $tool" >&2
      return 1
    }
  done
  node -e 'const major=Number(process.versions.node.split(".")[0]); process.exit(major >= 18 ? 0 : 1)' || {
    echo "install-9router-yolo: Node.js 18 or newer is required" >&2
    return 1
  }
}

prepare_tarball() {
  if [[ -n "$TARBALL" ]]; then
    TARBALL="$(cd "$(dirname "$TARBALL")" && pwd)/$(basename "$TARBALL")"
    [[ -f "$TARBALL" ]] || {
      echo "install-9router-yolo: tarball not found: $TARBALL" >&2
      return 1
    }
  else
    TEMP_DIR="$(mktemp -d /tmp/9router-yolo-install.XXXXXX)"
    npm pack "9router@$VERSION" --pack-destination "$TEMP_DIR" --loglevel=error >/dev/null
    TARBALL="$(find "$TEMP_DIR" -maxdepth 1 -name "9router-$VERSION.tgz" -print -quit)"
    [[ -n "$TARBALL" ]] || {
      echo "install-9router-yolo: npm pack did not produce the pinned tarball" >&2
      return 1
    }
  fi

  local actual_sha512
  actual_sha512="$(openssl dgst -sha512 -binary "$TARBALL" | openssl base64 -A)"
  if [[ "$actual_sha512" != "$EXPECTED_SHA512" ]]; then
    echo "install-9router-yolo: package integrity mismatch; refusing install" >&2
    return 1
  fi
}

write_install_receipt() {
  local target="$1"
  local sha256="$2"
  NINE_ROUTER_RECEIPT_TARGET="$target" \
  NINE_ROUTER_RECEIPT_VERSION="$VERSION" \
  NINE_ROUTER_RECEIPT_INTEGRITY="$INTEGRITY" \
  NINE_ROUTER_RECEIPT_SHA256="$sha256" \
  node <<'NODE'
const fs = require('fs');
const path = require('path');
const target = process.env.NINE_ROUTER_RECEIPT_TARGET;
fs.mkdirSync(path.dirname(target), { recursive: true, mode: 0o700 });
const receipt = {
  schema: '9router-yolo/install-v1',
  installedAt: new Date().toISOString(),
  package: '9router',
  version: process.env.NINE_ROUTER_RECEIPT_VERSION,
  integrity: process.env.NINE_ROUTER_RECEIPT_INTEGRITY,
  packageSha256: process.env.NINE_ROUTER_RECEIPT_SHA256,
  postinstallScriptsRun: false,
  loopbackOnly: true,
  credentialMigration: false,
  autostartInstalled: false,
};
const temporary = `${target}.${process.pid}.tmp`;
fs.writeFileSync(temporary, `${JSON.stringify(receipt, null, 2)}\n`, { mode: 0o600 });
fs.renameSync(temporary, target);
fs.chmodSync(target, 0o600);
NODE
}

install_one() {
  local prefix="$HOME/.local/share/9router/npm"
  local state="$HOME/.hermes/9router"
  local package_root="$prefix/lib/node_modules/9router"
  local sha256
  sha256="$(shasum -a 256 "$TARBALL" | awk '{print $1}')"

  mkdir -p "$prefix" "$state/bin" "$state/tools" "$state/data" "$HOME/.local/bin"
  chmod 0700 "$state" "$state/bin" "$state/tools" "$state/data"
  npm install -g --prefix "$prefix" --ignore-scripts --no-audit --no-fund "$TARBALL" --loglevel=error

  local installed_version
  installed_version="$(node -p "require(process.argv[1]).version" "$package_root/package.json")"
  [[ "$installed_version" == "$VERSION" ]] || {
    echo "install-9router-yolo: installed version mismatch: $installed_version" >&2
    return 1
  }
  [[ -f "$package_root/app/server.js" && -f "$package_root/src/cli/api/client.js" ]] || {
    echo "install-9router-yolo: official package is missing required runtime files" >&2
    return 1
  }

  install -m 0755 "$ROOT/9router-yolo" "$state/bin/9router-yolo"
  install -m 0755 "$ROOT/hermes-9router" "$state/bin/hermes-9router"
  install -m 0755 "$ROOT/tools/hermes-9router-harness.js" "$state/tools/hermes-9router-harness.js"
  ln -sfn "$state/bin/9router-yolo" "$HOME/.local/bin/9router-yolo"
  ln -sfn "$state/bin/hermes-9router" "$HOME/.local/bin/hermes-9router"
  write_install_receipt "$state/install.json" "$sha256"

  "$HOME/.local/bin/9router-yolo" start --json
  "$HOME/.local/bin/9router-yolo" smoke --json
  "$HOME/.local/bin/hermes-9router" --doctor --json
}

install_remote() {
  local host="$1"
  local remote_stage
  remote_stage="$(ssh -o BatchMode=yes -o ConnectTimeout=8 "$host" 'mktemp -d /tmp/9router-yolo-deploy.XXXXXX')"
  [[ "$remote_stage" == /tmp/9router-yolo-deploy.* ]] || {
    echo "install-9router-yolo: unsafe remote staging path" >&2
    return 1
  }
  (
    cd "$ROOT"
    rsync -aR \
      ./9router-yolo \
      ./hermes-9router \
      ./tools/hermes-9router-harness.js \
      ./scripts/install-9router-yolo.sh \
      "$host:$remote_stage/"
  )
  rsync -a "$TARBALL" "$host:$remote_stage/9router-$VERSION.tgz"
  if ! ssh -o BatchMode=yes -o ConnectTimeout=8 "$host" \
    "bash '$remote_stage/scripts/install-9router-yolo.sh' --no-remote --tarball '$remote_stage/9router-$VERSION.tgz'"; then
    ssh -o BatchMode=yes -o ConnectTimeout=8 "$host" "rm -rf '$remote_stage'" || true
    return 1
  fi
  ssh -o BatchMode=yes -o ConnectTimeout=8 "$host" "rm -rf '$remote_stage'"
}

verify_parity() {
  local host="$1"
  local local_hashes remote_hashes
  local_hashes="$(shasum -a 256 \
    "$HOME/.hermes/9router/bin/9router-yolo" \
    "$HOME/.hermes/9router/bin/hermes-9router" \
    "$HOME/.hermes/9router/tools/hermes-9router-harness.js" | cut -d ' ' -f 1)"
  remote_hashes="$(ssh -o BatchMode=yes -o ConnectTimeout=8 "$host" \
    'shasum -a 256 "$HOME/.hermes/9router/bin/9router-yolo" "$HOME/.hermes/9router/bin/hermes-9router" "$HOME/.hermes/9router/tools/hermes-9router-harness.js" | cut -d " " -f 1')"
  [[ "$local_hashes" == "$remote_hashes" ]] || {
    echo "install-9router-yolo: local/remote wrapper hashes differ" >&2
    return 1
  }
  echo "install-9router-yolo: local/remote wrapper hashes match"
}

require_tools
prepare_tarball

if ((INSTALL_LOCAL)); then
  install_one
fi

if ((INSTALL_REMOTE)); then
  ssh -o BatchMode=yes -o ConnectTimeout=8 "$REMOTE_HOST" \
    'command -v node >/dev/null && command -v npm >/dev/null && command -v openssl >/dev/null && command -v shasum >/dev/null; node -e '\''const major=Number(process.versions.node.split(".")[0]); process.exit(major >= 18 ? 0 : 1)'\'''
  install_remote "$REMOTE_HOST"
fi

if ((INSTALL_LOCAL && INSTALL_REMOTE)); then
  verify_parity "$REMOTE_HOST"
fi

echo "install-9router-yolo: pinned loopback-only gateway installed and verified"
