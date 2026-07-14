#!/usr/bin/env bash
# Install ibm-yolo on this Mac and Mac mini (Tailscale SSH).
#
# CRITICAL: never install a thin "exec share/ibm-yolo" wrapper.
# If bin is a symlink into share (or share is overwritten with the wrapper),
# the wrapper execs itself until ARG_MAX → "Argument list too long" (exit 126).
# Always install the FULL CLI body to BOTH ~/.local/bin/ibm-yolo and
# ~/.local/share/ibm-yolo/ibm-yolo as real files (no symlinks, no self-exec).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REMOTE_HOST="${IBM_YOLO_REMOTE_HOST:-hermes-mini}"
INSTALL_REMOTE=1
REMOTE_ONLY=0
CLI_SRC="${ROOT}/ibm-yolo"

usage() {
  echo "Usage: bash scripts/install-ibm-yolo.sh [--remote HOST|--no-remote|--remote-only]"
}

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
      exit 1
      ;;
  esac
done

if [[ ! -f "$CLI_SRC" ]]; then
  echo "install-ibm-yolo: missing $CLI_SRC" >&2
  exit 1
fi

# Reject installing a wrapper body by mistake
if head -20 "$CLI_SRC" | grep -qE 'exec .*share/ibm-yolo'; then
  echo "install-ibm-yolo: refusing to install self-exec wrapper as CLI body" >&2
  exit 1
fi
if ! head -5 "$CLI_SRC" | grep -q 'Enterprise multi-agent'; then
  echo "install-ibm-yolo: $CLI_SRC does not look like the ibm-yolo CLI" >&2
  exit 1
fi

resolve_repo() {
  if [[ -f "$HOME/workspace/git/igor/mac-yolo-safeguards/.worktrees/main-runtime/tools/hermes-hosting-market-signal.js" ]]; then
    echo "$HOME/workspace/git/igor/mac-yolo-safeguards/.worktrees/main-runtime"
  elif [[ -f "$HOME/workspace/git/igor/mac-yolo-safeguards/tools/hermes-hosting-market-signal.js" ]]; then
    echo "$HOME/workspace/git/igor/mac-yolo-safeguards"
  else
    echo "$ROOT"
  fi
}

# Install full CLI to bin + share; never write an exec-wrapper.
install_cli_files() {
  local src="$1"
  mkdir -p "$HOME/.local/bin" "$HOME/.local/share/ibm-yolo"
  # If bobshell hijacked the share path, keep IBM Bob yolo as bob-yolo
  if [[ -f "$HOME/.local/share/ibm-yolo/ibm-yolo" ]] && head -5 "$HOME/.local/share/ibm-yolo/ibm-yolo" | grep -qE 'Bob Shell|bob --yolo|Bob native'; then
    cp "$HOME/.local/share/ibm-yolo/ibm-yolo" "$HOME/.local/bin/bob-yolo"
    chmod 0755 "$HOME/.local/bin/bob-yolo"
    echo "OK preserved Bob Shell wrapper as bob-yolo"
  fi
  # Remove paths first so we never write through a bin→share symlink
  rm -f "$HOME/.local/bin/ibm-yolo" "$HOME/.local/share/ibm-yolo/ibm-yolo"
  install -m 0755 "$src" "$HOME/.local/share/ibm-yolo/ibm-yolo"
  install -m 0755 "$src" "$HOME/.local/bin/ibm-yolo"
  assert_not_wrapper "$HOME/.local/bin/ibm-yolo"
  assert_not_wrapper "$HOME/.local/share/ibm-yolo/ibm-yolo"
}

assert_not_wrapper() {
  local path="$1"
  if head -15 "$path" | grep -qE 'exec .*share/ibm-yolo'; then
    echo "FAIL $path is a self-exec wrapper" >&2
    exit 1
  fi
  local lines
  lines="$(wc -l < "$path" | tr -d ' ')"
  if (( lines < 50 )); then
    echo "FAIL $path too short ($lines lines) — expected full CLI" >&2
    exit 1
  fi
}

install_local() {
  local repo
  repo="$(resolve_repo)"
  install_cli_files "$CLI_SRC"
  echo "OK local $(hostname -s) ibm-yolo -> $HOME/.local/bin/ibm-yolo (full CLI, no wrapper)"
  echo "   share mirror -> $HOME/.local/share/ibm-yolo/ibm-yolo"
  echo "   default repo resolution uses: $repo (script prefers main-runtime when present)"
  env -u IBM_YOLO_REPO "$HOME/.local/bin/ibm-yolo" --doctor || true
}

install_remote() {
  local host="$1"
  echo "=== remote $host ==="
  if ! ssh -o BatchMode=yes -o ConnectTimeout=8 "$host" 'true' 2>/dev/null; then
    echo "FAIL ssh $host" >&2
    return 1
  fi

  # Ensure remote checkout tracks main
  ssh -o BatchMode=yes -o ConnectTimeout=12 "$host" \
    'mkdir -p "$HOME/workspace/git/igor" "$HOME/.local/bin" "$HOME/.local/share/ibm-yolo" "$HOME/workspace/git/igor/mac-yolo-safeguards/business_os/revenue"
     R="$HOME/workspace/git/igor/mac-yolo-safeguards"
     if [ -d "$R/.git" ]; then
       git -C "$R" fetch origin main -q 2>/dev/null || true
       git -C "$R" checkout main -q 2>/dev/null || true
       git -C "$R" pull --ff-only origin main -q 2>/dev/null || git -C "$R" reset --hard origin/main -q 2>/dev/null || true
     elif [ ! -e "$R" ]; then
       git clone -q --branch main https://github.com/IgorGanapolsky/mac-yolo-safeguards.git "$R" 2>/dev/null \
         || git clone -q https://github.com/IgorGanapolsky/mac-yolo-safeguards.git "$R" || true
     fi
     if [ -d "$R/.git" ] && [ ! -e "$R/.worktrees/main-runtime" ]; then
       mkdir -p "$R/.worktrees"
       git -C "$R" worktree add -B main-runtime "$R/.worktrees/main-runtime" origin/main 2>/dev/null || true
     fi
     if [ -d "$R/.worktrees/main-runtime/.git" ] || [ -f "$R/.worktrees/main-runtime/.git" ]; then
       git -C "$R/.worktrees/main-runtime" fetch origin main -q 2>/dev/null || true
       git -C "$R/.worktrees/main-runtime" reset --hard origin/main -q 2>/dev/null || true
     fi
     echo remote_repo_ready'

  local remote_repo
  remote_repo="$(ssh -o BatchMode=yes -o ConnectTimeout=8 "$host" \
    'R=$HOME/workspace/git/igor/mac-yolo-safeguards
     if [ -f $R/.worktrees/main-runtime/tools/hermes-hosting-market-signal.js ]; then echo $R/.worktrees/main-runtime
     elif [ -f $R/tools/hermes-hosting-market-signal.js ]; then echo $R
     else echo $R; fi')"

  ssh -o BatchMode=yes -o ConnectTimeout=8 "$host" "mkdir -p '$remote_repo/tools' '$remote_repo/docs'"

  # Tools + docs only (never rsync ibm-yolo into tools/)
  rsync -a \
    "$ROOT/tools/hermes-hosting-market-signal.js" \
    "$ROOT/tools/smart-ops-controller.js" \
    "$ROOT/tools/revenue-autonomous-loop.js" \
    "$host:$remote_repo/tools/"
  rsync -a "$ROOT/docs/ENTERPRISE-AGENT-SDLC-RELIABILITY.md" \
    "$ROOT/docs/HERMES-HOSTED-RELIABILITY.md" \
    "$host:$remote_repo/docs/" 2>/dev/null || true
  rsync -a "$ROOT/ibm-yolo" "$host:$remote_repo/ibm-yolo" 2>/dev/null || true

  # Full CLI to share + bin (no wrapper)
  rsync -a "$ROOT/ibm-yolo" "$host:/tmp/ibm-yolo-install-body"
  ssh -o BatchMode=yes -o ConnectTimeout=12 "$host" 'bash -s' <<'REMOTE'
set -euo pipefail
src=/tmp/ibm-yolo-install-body
if head -20 "$src" | grep -qE 'exec .*share/ibm-yolo'; then
  echo "FAIL remote refused wrapper body" >&2
  exit 1
fi
mkdir -p "$HOME/.local/bin" "$HOME/.local/share/ibm-yolo"
if [[ -f "$HOME/.local/share/ibm-yolo/ibm-yolo" ]] && head -5 "$HOME/.local/share/ibm-yolo/ibm-yolo" | grep -qE 'Bob Shell|bob --yolo|Bob native'; then
  cp "$HOME/.local/share/ibm-yolo/ibm-yolo" "$HOME/.local/bin/bob-yolo"
  chmod 0755 "$HOME/.local/bin/bob-yolo"
fi
rm -f "$HOME/.local/bin/ibm-yolo" "$HOME/.local/share/ibm-yolo/ibm-yolo"
install -m 0755 "$src" "$HOME/.local/share/ibm-yolo/ibm-yolo"
install -m 0755 "$src" "$HOME/.local/bin/ibm-yolo"
for p in "$HOME/.local/bin/ibm-yolo" "$HOME/.local/share/ibm-yolo/ibm-yolo"; do
  if head -15 "$p" | grep -qE 'exec .*share/ibm-yolo'; then
    echo "FAIL $p is wrapper" >&2
    exit 1
  fi
  lines=$(wc -l < "$p" | tr -d " ")
  if [ "$lines" -lt 50 ]; then
    echo "FAIL $p too short ($lines)" >&2
    exit 1
  fi
done
echo "remote_cli_ok bin_lines=$(wc -l < "$HOME/.local/bin/ibm-yolo" | tr -d " ")"
REMOTE

  # Private revenue map/pipeline so doctor + CTA work on mini
  if [[ -f "$HOME/workspace/git/igor/mac-yolo-safeguards/business_os/revenue/stripe-offer-map-2026-07-07.tsv" ]]; then
    rsync -a \
      "$HOME/workspace/git/igor/mac-yolo-safeguards/business_os/revenue/stripe-offer-map-2026-07-07.tsv" \
      "$HOME/workspace/git/igor/mac-yolo-safeguards/business_os/revenue/pipeline-status-2026-07-07.tsv" \
      "$host:~/workspace/git/igor/mac-yolo-safeguards/business_os/revenue/" 2>/dev/null || true
  fi

  echo "OK remote $host full CLI (no wrapper) IBM_YOLO_REPO default → $remote_repo"
  ssh -o BatchMode=yes -o ConnectTimeout=12 "$host" '"$HOME/.local/bin/ibm-yolo" --doctor' || true
  ssh -o BatchMode=yes -o ConnectTimeout=60 "$host" '"$HOME/.local/bin/ibm-yolo" --no-apply --json' 2>/dev/null | head -c 400 || true
  echo ""
}

if ((REMOTE_ONLY == 0)); then
  install_local
fi

if ((INSTALL_REMOTE)); then
  if ! install_remote "$REMOTE_HOST"; then
    echo "WARN remote failed; trying 100.94.135.78" >&2
    install_remote "100.94.135.78" || echo "WARN mini install incomplete" >&2
  fi
fi

echo "INSTALL_DONE local=$(hostname -s) remote=$INSTALL_REMOTE:$REMOTE_HOST"
