#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REMOTE_HOST="${META_YOLO_REMOTE_HOST:-hermes-mini}"
INSTALL_REMOTE=1

usage() {
  echo "Usage: bash scripts/install-meta-yolo.sh [--remote HOST|--no-remote]"
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
      echo "install-meta-yolo: unknown argument: $1" >&2
      usage >&2
      exit 2
      ;;
  esac
done

install_local() {
  local opencode_bin
  opencode_bin="$(command -v opencode 2>/dev/null || true)"
  if [[ -z "$opencode_bin" || ! -x "$opencode_bin" ]]; then
    if ! command -v brew >/dev/null 2>&1; then
      echo "install-meta-yolo: Homebrew is required to install OpenCode on $(hostname)" >&2
      return 1
    fi
    HOMEBREW_NO_AUTO_UPDATE=1 brew install anomalyco/tap/opencode
    opencode_bin="$(command -v opencode 2>/dev/null || true)"
  fi
  if [[ -z "$opencode_bin" || ! -x "$opencode_bin" ]]; then
    echo "install-meta-yolo: OpenCode installation failed on $(hostname)" >&2
    return 1
  fi

  local hermes_bin="$HOME/.local/bin/hermes"
  if [[ ! -x "$hermes_bin" ]]; then
    hermes_bin="$(command -v hermes 2>/dev/null || true)"
  fi
  if [[ -z "$hermes_bin" || ! -x "$hermes_bin" ]]; then
    echo "install-meta-yolo: Hermes is missing on $(hostname)" >&2
    return 1
  fi

  mkdir -p "$HOME/.hermes/meta-muse/tools" "$HOME/.local/bin"
  install -m 0755 "$ROOT/meta-yolo-wrapper.js" "$HOME/.hermes/meta-muse/meta-yolo-wrapper.js"
  install -m 0755 "$ROOT/tools/hermes-meta-muse-config.js" "$HOME/.hermes/meta-muse/tools/hermes-meta-muse-config.js"
  ln -sfn "$HOME/.hermes/meta-muse/meta-yolo-wrapper.js" "$HOME/.local/bin/meta-yolo"

  node "$HOME/.hermes/meta-muse/tools/hermes-meta-muse-config.js" \
    --apply --hermes-home "$HOME/.hermes" --hermes-bin "$hermes_bin" --json >/dev/null
  node "$HOME/.hermes/meta-muse/tools/hermes-meta-muse-config.js" \
    --apply --isolated --hermes-home "$HOME/.hermes/meta-muse-profile" \
    --hermes-bin "$hermes_bin" --json >/dev/null
}

install_remote() {
  local host="$1"
  ssh -o BatchMode=yes -o ConnectTimeout=8 "$host" \
    'mkdir -p "$HOME/.hermes/meta-muse/tools" "$HOME/.local/bin"'
  rsync -a "$ROOT/meta-yolo-wrapper.js" "$host:~/.hermes/meta-muse/meta-yolo-wrapper.js"
  rsync -a "$ROOT/tools/hermes-meta-muse-config.js" "$host:~/.hermes/meta-muse/tools/hermes-meta-muse-config.js"
  ssh -o BatchMode=yes -o ConnectTimeout=8 "$host" '
    set -eu
    opencode_bin="$(command -v opencode 2>/dev/null || true)"
    if [ -z "$opencode_bin" ] || [ ! -x "$opencode_bin" ]; then
      if ! command -v brew >/dev/null 2>&1; then echo "install-meta-yolo: Homebrew is required to install OpenCode" >&2; exit 1; fi
      HOMEBREW_NO_AUTO_UPDATE=1 brew install anomalyco/tap/opencode
      opencode_bin="$(command -v opencode 2>/dev/null || true)"
    fi
    if [ -z "$opencode_bin" ] || [ ! -x "$opencode_bin" ]; then echo "install-meta-yolo: OpenCode installation failed" >&2; exit 1; fi
    chmod 0755 "$HOME/.hermes/meta-muse/meta-yolo-wrapper.js" "$HOME/.hermes/meta-muse/tools/hermes-meta-muse-config.js"
    ln -sfn "$HOME/.hermes/meta-muse/meta-yolo-wrapper.js" "$HOME/.local/bin/meta-yolo"
    node_bin="$(command -v node 2>/dev/null || true)"
    hermes_bin="$HOME/.local/bin/hermes"
    if [ -z "$node_bin" ]; then echo "install-meta-yolo: Node is missing" >&2; exit 1; fi
    if [ ! -x "$hermes_bin" ]; then hermes_bin="$(command -v hermes 2>/dev/null || true)"; fi
    if [ -z "$hermes_bin" ] || [ ! -x "$hermes_bin" ]; then echo "install-meta-yolo: Hermes is missing" >&2; exit 1; fi
    "$node_bin" "$HOME/.hermes/meta-muse/tools/hermes-meta-muse-config.js" --apply --hermes-home "$HOME/.hermes" --hermes-bin "$hermes_bin" --json >/dev/null
    "$node_bin" "$HOME/.hermes/meta-muse/tools/hermes-meta-muse-config.js" --apply --isolated --hermes-home "$HOME/.hermes/meta-muse-profile" --hermes-bin "$hermes_bin" --json >/dev/null
  '
}

doctor_local() {
  local output status=0
  output="$("$HOME/.local/bin/meta-yolo" --doctor --json)" || status=$?
  echo "$output"
  META_YOLO_DOCTOR_JSON="$output" node -e '
    const report = JSON.parse(process.env.META_YOLO_DOCTOR_JSON || "{}");
    const allowed = new Set(["meta_model_api_key_missing"]);
    const unexpected = (report.blockers || []).filter((item) => !allowed.has(item));
    if (unexpected.length) {
      console.error(`install-meta-yolo: unexpected local blockers: ${unexpected.join(", ")}`);
      process.exit(1);
    }
  '
  [[ "$status" == 0 || "$status" == 78 ]]
}

doctor_remote() {
  local host="$1" output status=0
  output="$(ssh -o BatchMode=yes -o ConnectTimeout=8 "$host" '"$HOME/.local/bin/meta-yolo" --doctor --json')" || status=$?
  echo "$output"
  META_YOLO_DOCTOR_JSON="$output" node -e '
    const report = JSON.parse(process.env.META_YOLO_DOCTOR_JSON || "{}");
    const allowed = new Set(["meta_model_api_key_missing"]);
    const unexpected = (report.blockers || []).filter((item) => !allowed.has(item));
    if (unexpected.length) {
      console.error(`install-meta-yolo: unexpected remote blockers: ${unexpected.join(", ")}`);
      process.exit(1);
    }
  '
  [[ "$status" == 0 || "$status" == 78 ]]
}

verify_hashes() {
  local local_hash remote_hash
  local_hash="$(shasum -a 256 "$HOME/.hermes/meta-muse/meta-yolo-wrapper.js" | awk '{print $1}')"
  if ((INSTALL_REMOTE)); then
    remote_hash="$(ssh -o BatchMode=yes -o ConnectTimeout=8 "$REMOTE_HOST" 'shasum -a 256 "$HOME/.hermes/meta-muse/meta-yolo-wrapper.js"' | awk '{print $1}')"
    if [[ "$local_hash" != "$remote_hash" ]]; then
      echo "install-meta-yolo: wrapper hash mismatch between hosts" >&2
      return 1
    fi
  fi
  echo "meta-yolo wrapper sha256=$local_hash"
}

install_local
if ((INSTALL_REMOTE)); then
  install_remote "$REMOTE_HOST"
fi

doctor_local
if ((INSTALL_REMOTE)); then
  doctor_remote "$REMOTE_HOST"
fi
verify_hashes

echo "install-meta-yolo: dedicated OpenCode Meta CLI and explicit fail-closed Hermes route installed on requested hosts"
