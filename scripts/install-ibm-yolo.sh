#!/usr/bin/env bash
# install-ibm-yolo.sh — install ibm-yolo like grok-yolo / meta-yolo / hermes-yolo
#
# Layout (matches the other *-yolo family):
#   ~/.hermes/ibm-bob/ibm-yolo                 full CLI body
#   ~/.hermes/ibm-bob/tools/*.js               market-signal + smart-ops tools
#   ~/.hermes/ibm-bob/docs/*.md                positioning docs
#   ~/.local/bin/ibm-yolo  →  symlink to hermes home body
#
# Never write a thin "exec share/..." wrapper. Symlink bin → real body only
# (same as grok-yolo → ~/.hermes/grok45/grok-yolo-wrapper.js).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REMOTE_HOST="${IBM_YOLO_REMOTE_HOST:-hermes-mini}"
INSTALL_REMOTE=1
HERMES_HOME_REL=".hermes/ibm-bob"

usage() {
  echo "Usage: bash scripts/install-ibm-yolo.sh [--remote HOST|--no-remote|--remote-only]"
}

REMOTE_ONLY=0
while (($#)); do
  case "$1" in
    --remote)
      REMOTE_HOST="${2:?}"
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
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "install-ibm-yolo: unknown: $1" >&2
      usage >&2
      exit 1
      ;;
  esac
done

CLI_SRC="$ROOT/ibm-yolo"
if [[ ! -f "$CLI_SRC" ]]; then
  echo "install-ibm-yolo: missing $CLI_SRC" >&2
  exit 1
fi
if head -20 "$CLI_SRC" | grep -qE 'exec .*share/ibm-yolo'; then
  echo "install-ibm-yolo: refusing self-exec wrapper body" >&2
  exit 1
fi
if ! head -5 "$CLI_SRC" | grep -q 'Enterprise multi-agent'; then
  echo "install-ibm-yolo: $CLI_SRC does not look like ibm-yolo" >&2
  exit 1
fi

require_tools() {
  local base="$1"
  for f in \
    tools/hermes-hosting-market-signal.js \
    tools/smart-ops-controller.js \
    tools/revenue-autonomous-loop.js; do
    if [[ ! -f "$base/$f" ]]; then
      echo "install-ibm-yolo: missing $base/$f" >&2
      exit 1
    fi
  done
}

install_local_files() {
  local dest="$HOME/$HERMES_HOME_REL"
  mkdir -p "$dest/tools" "$dest/docs" "$HOME/.local/bin"

  # Preserve IBM Bob Shell if it hijacked ibm-yolo name earlier
  if [[ -f "$HOME/.local/share/ibm-yolo/ibm-yolo" ]] && head -5 "$HOME/.local/share/ibm-yolo/ibm-yolo" 2>/dev/null | grep -qE 'Bob Shell|bob --yolo|Bob native'; then
    cp "$HOME/.local/share/ibm-yolo/ibm-yolo" "$HOME/.local/bin/bob-yolo"
    chmod 0755 "$HOME/.local/bin/bob-yolo"
    echo "OK preserved Bob Shell as bob-yolo"
  fi
  if [[ -f "$HOME/.local/bin/ibm-yolo" ]] && ! [[ -L "$HOME/.local/bin/ibm-yolo" ]] && head -5 "$HOME/.local/bin/ibm-yolo" 2>/dev/null | grep -qE 'Bob Shell|bob --yolo|Bob native'; then
    cp "$HOME/.local/bin/ibm-yolo" "$HOME/.local/bin/bob-yolo"
    chmod 0755 "$HOME/.local/bin/bob-yolo"
    echo "OK preserved Bob Shell as bob-yolo (from bin)"
  fi

  install -m 0755 "$CLI_SRC" "$dest/ibm-yolo"
  install -m 0644 "$ROOT/tools/hermes-hosting-market-signal.js" "$dest/tools/hermes-hosting-market-signal.js"
  install -m 0644 "$ROOT/tools/smart-ops-controller.js" "$dest/tools/smart-ops-controller.js"
  install -m 0644 "$ROOT/tools/revenue-autonomous-loop.js" "$dest/tools/revenue-autonomous-loop.js"
  if [[ -f "$ROOT/tools/pipeline-update.js" ]]; then
    install -m 0644 "$ROOT/tools/pipeline-update.js" "$dest/tools/pipeline-update.js"
  fi
  if [[ -f "$ROOT/docs/ENTERPRISE-AGENT-SDLC-RELIABILITY.md" ]]; then
    install -m 0644 "$ROOT/docs/ENTERPRISE-AGENT-SDLC-RELIABILITY.md" "$dest/docs/ENTERPRISE-AGENT-SDLC-RELIABILITY.md"
  fi
  if [[ -f "$ROOT/docs/HERMES-HOSTED-RELIABILITY.md" ]]; then
    install -m 0644 "$ROOT/docs/HERMES-HOSTED-RELIABILITY.md" "$dest/docs/HERMES-HOSTED-RELIABILITY.md"
  fi

  require_tools "$dest"

  # PATH entry: symlink only (never copy wrapper). Remove any old real-file first.
  rm -f "$HOME/.local/bin/ibm-yolo"
  # Clean legacy share body so it cannot reintroduce self-exec loops
  if [[ -f "$HOME/.local/share/ibm-yolo/ibm-yolo" ]]; then
    rm -f "$HOME/.local/share/ibm-yolo/ibm-yolo"
  fi
  ln -sfn "$dest/ibm-yolo" "$HOME/.local/bin/ibm-yolo"

  # Sanity
  if [[ ! -L "$HOME/.local/bin/ibm-yolo" ]]; then
    echo "FAIL expected ~/.local/bin/ibm-yolo to be a symlink" >&2
    exit 1
  fi
  if head -15 "$dest/ibm-yolo" | grep -qE 'exec .*share/ibm-yolo'; then
    echo "FAIL hermes home body is a self-exec wrapper" >&2
    exit 1
  fi

  echo "OK local $(hostname -s) ibm-yolo"
  echo "   body: $dest/ibm-yolo"
  echo "   bin:  $HOME/.local/bin/ibm-yolo -> $(readlink "$HOME/.local/bin/ibm-yolo")"
}

install_remote_files() {
  local host="$1"
  echo "=== remote $host ==="
  if ! ssh -o BatchMode=yes -o ConnectTimeout=8 "$host" 'true' 2>/dev/null; then
    echo "FAIL ssh $host" >&2
    return 1
  fi

  ssh -o BatchMode=yes -o ConnectTimeout=8 "$host" \
    "mkdir -p \"\$HOME/$HERMES_HOME_REL/tools\" \"\$HOME/$HERMES_HOME_REL/docs\" \"\$HOME/.local/bin\" \"\$HOME/workspace/git/igor/mac-yolo-safeguards/business_os/revenue\""

  rsync -a "$CLI_SRC" "$host:~/$HERMES_HOME_REL/ibm-yolo"
  rsync -a \
    "$ROOT/tools/hermes-hosting-market-signal.js" \
    "$ROOT/tools/smart-ops-controller.js" \
    "$ROOT/tools/revenue-autonomous-loop.js" \
    "$host:~/$HERMES_HOME_REL/tools/"
  rsync -a \
    "$ROOT/docs/ENTERPRISE-AGENT-SDLC-RELIABILITY.md" \
    "$ROOT/docs/HERMES-HOSTED-RELIABILITY.md" \
    "$host:~/$HERMES_HOME_REL/docs/" 2>/dev/null || true

  # Private revenue map so doctor/CTA work on mini (gitignored ops data)
  if [[ -f "$HOME/workspace/git/igor/mac-yolo-safeguards/business_os/revenue/stripe-offer-map-2026-07-07.tsv" ]]; then
    rsync -a \
      "$HOME/workspace/git/igor/mac-yolo-safeguards/business_os/revenue/stripe-offer-map-2026-07-07.tsv" \
      "$HOME/workspace/git/igor/mac-yolo-safeguards/business_os/revenue/pipeline-status-2026-07-07.tsv" \
      "$host:~/workspace/git/igor/mac-yolo-safeguards/business_os/revenue/" 2>/dev/null || true
  fi

  ssh -o BatchMode=yes -o ConnectTimeout=12 "$host" "bash -s" <<REMOTE
set -euo pipefail
dest="\$HOME/$HERMES_HOME_REL"
chmod 0755 "\$dest/ibm-yolo"
# preserve bob shell if present
if [[ -f "\$HOME/.local/bin/ibm-yolo" ]] && ! [[ -L "\$HOME/.local/bin/ibm-yolo" ]] && head -5 "\$HOME/.local/bin/ibm-yolo" 2>/dev/null | grep -qE 'Bob Shell|bob --yolo|Bob native'; then
  cp "\$HOME/.local/bin/ibm-yolo" "\$HOME/.local/bin/bob-yolo"
  chmod 0755 "\$HOME/.local/bin/bob-yolo"
fi
rm -f "\$HOME/.local/bin/ibm-yolo" "\$HOME/.local/share/ibm-yolo/ibm-yolo"
ln -sfn "\$dest/ibm-yolo" "\$HOME/.local/bin/ibm-yolo"
test -L "\$HOME/.local/bin/ibm-yolo"
test -f "\$dest/tools/hermes-hosting-market-signal.js"
echo "remote_ok bin=\$(readlink "\$HOME/.local/bin/ibm-yolo") lines=\$(wc -l < "\$dest/ibm-yolo" | tr -d ' ')"
REMOTE

  echo "OK remote $host"
}

doctor_local() {
  echo "=== Local ibm-yolo doctor ($(hostname -s)) ==="
  ls -la "$HOME/.local/bin/ibm-yolo"
  readlink "$HOME/.local/bin/ibm-yolo" || true
  env -u IBM_YOLO_REPO "$HOME/.local/bin/ibm-yolo" --doctor
}

doctor_remote() {
  local host="$1"
  echo "=== Remote ibm-yolo doctor ($host) ==="
  ssh -o BatchMode=yes -o ConnectTimeout=12 "$host" \
    'ls -la "$HOME/.local/bin/ibm-yolo"; readlink "$HOME/.local/bin/ibm-yolo"; env -u IBM_YOLO_REPO "$HOME/.local/bin/ibm-yolo" --doctor'
}

if ((REMOTE_ONLY == 0)); then
  install_local_files
fi

if ((INSTALL_REMOTE)); then
  if ! install_remote_files "$REMOTE_HOST"; then
    echo "WARN remote failed; trying 100.94.135.78" >&2
    install_remote_files "100.94.135.78" || echo "WARN mini install incomplete" >&2
  fi
fi

status=0
if ((REMOTE_ONLY == 0)); then
  doctor_local || status=2
fi
if ((INSTALL_REMOTE)); then
  doctor_remote "$REMOTE_HOST" || status=2
fi

# Smoke: bare run should exit 0
if ((REMOTE_ONLY == 0)); then
  if ! env -u IBM_YOLO_REPO "$HOME/.local/bin/ibm-yolo" --no-apply >/tmp/ibm-yolo-smoke.out 2>&1; then
    echo "FAIL local smoke" >&2
    head -30 /tmp/ibm-yolo-smoke.out >&2 || true
    status=2
  else
    head -8 /tmp/ibm-yolo-smoke.out
    echo "OK local smoke exit 0"
  fi
fi

if ((status != 0)); then
  echo "install-ibm-yolo: installed with warnings/failures (status=$status)" >&2
  exit "$status"
fi

echo "install-ibm-yolo: ready (hermes home + ~/.local/bin symlink, like grok-yolo/meta-yolo)"
