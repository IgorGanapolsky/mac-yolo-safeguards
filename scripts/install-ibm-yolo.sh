#!/usr/bin/env bash
# Install ibm-yolo on this Mac and Mac mini (Tailscale SSH).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REMOTE_HOST="${IBM_YOLO_REMOTE_HOST:-hermes-mini}"
INSTALL_REMOTE=1
REMOTE_ONLY=0

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

resolve_repo() {
  if [[ -f "$HOME/workspace/git/igor/mac-yolo-safeguards/.worktrees/main-runtime/tools/hermes-hosting-market-signal.js" ]]; then
    echo "$HOME/workspace/git/igor/mac-yolo-safeguards/.worktrees/main-runtime"
  elif [[ -f "$HOME/workspace/git/igor/mac-yolo-safeguards/tools/hermes-hosting-market-signal.js" ]]; then
    echo "$HOME/workspace/git/igor/mac-yolo-safeguards"
  else
    echo "$ROOT"
  fi
}

write_wrapper() {
  local bin_path="$1"
  local repo="$2"
  # Never use a symlink: writing the wrapper through a bin→share symlink
  # overwrites the real CLI body (that was the "cannot run ibm-yolo" bug).
  rm -f "$bin_path"
  cat >"$bin_path" <<EOF
#!/usr/bin/env bash
export IBM_YOLO_REPO="\${IBM_YOLO_REPO:-$repo}"
export REVENUE_DIR="\${REVENUE_DIR:-\$HOME/workspace/git/igor/mac-yolo-safeguards/business_os/revenue}"
export PATH="\$HOME/.local/bin:/opt/homebrew/bin:/usr/local/bin:\$PATH"
exec "\$HOME/.local/share/ibm-yolo/ibm-yolo" "\$@"
EOF
  chmod 0755 "$bin_path"
}

install_local() {
  local repo
  repo="$(resolve_repo)"
  mkdir -p "$HOME/.local/bin" "$HOME/.local/share/ibm-yolo"
  # If bobshell hijacked the name, keep IBM Bob yolo as bob-yolo
  if [[ -f "$HOME/.local/share/ibm-yolo/ibm-yolo" ]] && head -3 "$HOME/.local/share/ibm-yolo/ibm-yolo" | grep -qE 'Bob Shell|bob --yolo|Bob native'; then
    cp "$HOME/.local/share/ibm-yolo/ibm-yolo" "$HOME/.local/bin/bob-yolo"
    chmod 0755 "$HOME/.local/bin/bob-yolo"
    echo "OK preserved Bob Shell wrapper as bob-yolo"
  fi
  rm -f "$HOME/.local/share/ibm-yolo/ibm-yolo" "$HOME/.local/bin/ibm-yolo"
  install -m 0755 "$ROOT/ibm-yolo" "$HOME/.local/share/ibm-yolo/ibm-yolo"
  write_wrapper "$HOME/.local/bin/ibm-yolo" "$repo"
  echo "OK local $(hostname -s) ibm-yolo -> $HOME/.local/bin/ibm-yolo"
  echo "   IBM_YOLO_REPO=$repo"
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

  # Copy CLI binary
  rsync -a "$ROOT/ibm-yolo" "$host:~/.local/share/ibm-yolo/ibm-yolo"
  ssh -o BatchMode=yes -o ConnectTimeout=8 "$host" 'chmod 0755 "$HOME/.local/share/ibm-yolo/ibm-yolo"'

  # If main not yet containing tools, sync critical files from this ROOT
  local remote_repo
  remote_repo="$(ssh -o BatchMode=yes -o ConnectTimeout=8 "$host" \
    'R=$HOME/workspace/git/igor/mac-yolo-safeguards
     if [ -f $R/.worktrees/main-runtime/tools/hermes-hosting-market-signal.js ]; then echo $R/.worktrees/main-runtime
     elif [ -f $R/tools/hermes-hosting-market-signal.js ]; then echo $R
     else echo $R; fi')"

  ssh -o BatchMode=yes -o ConnectTimeout=8 "$host" "mkdir -p '$remote_repo/tools' '$remote_repo/docs'"
  rsync -a \
    "$ROOT/ibm-yolo" \
    "$ROOT/tools/hermes-hosting-market-signal.js" \
    "$ROOT/tools/smart-ops-controller.js" \
    "$ROOT/tools/revenue-autonomous-loop.js" \
    "$host:$remote_repo/tools/" 2>/dev/null || {
      # ibm-yolo is not under tools — copy tools only
      rsync -a \
        "$ROOT/tools/hermes-hosting-market-signal.js" \
        "$ROOT/tools/smart-ops-controller.js" \
        "$ROOT/tools/revenue-autonomous-loop.js" \
        "$host:$remote_repo/tools/"
    }
  # Ensure market signal + docs exist on remote runtime
  rsync -a "$ROOT/tools/hermes-hosting-market-signal.js" "$host:$remote_repo/tools/"
  rsync -a "$ROOT/tools/smart-ops-controller.js" "$host:$remote_repo/tools/" 2>/dev/null || true
  rsync -a "$ROOT/tools/revenue-autonomous-loop.js" "$host:$remote_repo/tools/" 2>/dev/null || true
  rsync -a "$ROOT/docs/ENTERPRISE-AGENT-SDLC-RELIABILITY.md" \
    "$ROOT/docs/HERMES-HOSTED-RELIABILITY.md" \
    "$host:$remote_repo/docs/" 2>/dev/null || true
  # Place ibm-yolo script also at remote_repo/ibm-yolo for reference
  rsync -a "$ROOT/ibm-yolo" "$host:$remote_repo/ibm-yolo" 2>/dev/null || true

  # Private revenue map/pipeline so doctor + CTA work on mini
  if [[ -f "$HOME/workspace/git/igor/mac-yolo-safeguards/business_os/revenue/stripe-offer-map-2026-07-07.tsv" ]]; then
    rsync -a \
      "$HOME/workspace/git/igor/mac-yolo-safeguards/business_os/revenue/stripe-offer-map-2026-07-07.tsv" \
      "$HOME/workspace/git/igor/mac-yolo-safeguards/business_os/revenue/pipeline-status-2026-07-07.tsv" \
      "$host:~/workspace/git/igor/mac-yolo-safeguards/business_os/revenue/" 2>/dev/null || true
  fi

  # Wrapper on remote
  ssh -o BatchMode=yes -o ConnectTimeout=8 "$host" \
    "printf '%s\n' '#!/usr/bin/env bash' \
      'export IBM_YOLO_REPO=\"\${IBM_YOLO_REPO:-$remote_repo}\"' \
      'export REVENUE_DIR=\"\${REVENUE_DIR:-\$HOME/workspace/git/igor/mac-yolo-safeguards/business_os/revenue}\"' \
      'export PATH=\"\$HOME/.local/bin:/opt/homebrew/bin:/usr/local/bin:\$PATH\"' \
      'exec \"\$HOME/.local/share/ibm-yolo/ibm-yolo\" \"\$@\"' \
      > \"\$HOME/.local/bin/ibm-yolo\" && chmod 0755 \"\$HOME/.local/bin/ibm-yolo\""

  echo "OK remote $host IBM_YOLO_REPO=$remote_repo"
  ssh -o BatchMode=yes -o ConnectTimeout=12 "$host" '"$HOME/.local/bin/ibm-yolo" --doctor' || true
  # smoke run no-apply
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
