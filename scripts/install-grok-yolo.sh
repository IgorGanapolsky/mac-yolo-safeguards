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

# Refuse to install a pre-SuperGrok hermes-yolo-wrapper (2026-08-05 regression:
# stale branch checkout re-installed quota-independent-default and wiped grok-4.5 auto).
resolve_hermes_yolo_wrapper_src() {
  local src="${1:-$ROOT/hermes-yolo-wrapper.js}"
  local tmp="$ROOT/.hermes-yolo-wrapper.from-main.js"
  if [[ -f "$src" ]] && grep -q 'isGrokBackendReady' "$src" && grep -q 'auto-supergrok-ready' "$src"; then
    printf '%s\n' "$src"
    return 0
  fi
  echo "install-grok-yolo: WARNING — $src is missing SuperGrok markers (isGrokBackendReady / auto-supergrok-ready)" >&2
  if git -C "$ROOT" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    if git -C "$ROOT" show origin/main:hermes-yolo-wrapper.js 2>/dev/null | grep -q 'isGrokBackendReady'; then
      git -C "$ROOT" show origin/main:hermes-yolo-wrapper.js >"$tmp"
      if grep -q 'auto-supergrok-ready' "$tmp"; then
        echo "install-grok-yolo: using origin/main:hermes-yolo-wrapper.js instead of stale checkout" >&2
        printf '%s\n' "$tmp"
        return 0
      fi
    fi
  fi
  echo "install-grok-yolo: refusing to install hermes-yolo-wrapper without SuperGrok routing" >&2
  echo "install-grok-yolo: checkout origin/main or set ROOT to a SuperGrok-capable tree" >&2
  return 1
}

pin_supergrok_launch_env() {
  # Best-effort: launchctl env is process-session scoped on some macOS versions.
  if command -v launchctl >/dev/null 2>&1; then
    launchctl setenv HERMES_YOLO_BACKEND grok 2>/dev/null || true
    # Stale glm pin defeats SuperGrok preference in degradation policy v2.
    local pinned
    pinned="$(launchctl getenv HERMES_YOLO_MODEL 2>/dev/null || true)"
    if [[ "$pinned" == glm-coding || "$pinned" == glm-5.2 || "$pinned" == glm-5 ]]; then
      launchctl unsetenv HERMES_YOLO_MODEL 2>/dev/null || true
      echo "install-grok-yolo: cleared stale launchctl HERMES_YOLO_MODEL=$pinned" >&2
    fi
  fi
  mkdir -p "$HOME/.hermes"
  # Durable hint for shells that source this file (never secrets).
  cat >"$HOME/.hermes/supergrok-route.env" <<'EOF'
# Written by scripts/install-grok-yolo.sh — SuperGrok coding primary
export HERMES_YOLO_BACKEND=grok
# Do not pin HERMES_YOLO_MODEL=glm-coding while SuperGrok is ready
unset HERMES_YOLO_MODEL
EOF
  chmod 0644 "$HOME/.hermes/supergrok-route.env"
}

install_local_files() {
  local wrapper_src
  wrapper_src="$(resolve_hermes_yolo_wrapper_src "$ROOT/hermes-yolo-wrapper.js")"
  mkdir -p "$HOME/.hermes/grok45/tools" "$HOME/.local/bin"
  install -m 0755 "$ROOT/grok-yolo-wrapper.js" "$HOME/.hermes/grok45/grok-yolo-wrapper.js"
  install -m 0755 "$wrapper_src" "$HOME/.hermes/hermes-yolo-wrapper.js"
  # Yugabyte AMP sprawl control (fleet registry, decision traces, guarded autonomy)
  if [[ -f "$ROOT/tools/hermes-yolo-sprawl-control.js" ]]; then
    install -m 0755 "$ROOT/tools/hermes-yolo-sprawl-control.js" "$HOME/.hermes/hermes-yolo-sprawl-control.js"
  fi
  # Progressive Agent Skills lean-context (Google for Devs pattern) — next to wrapper for require()
  if [[ -f "$ROOT/tools/hermes-yolo-lean-context.js" ]]; then
    install -m 0755 "$ROOT/tools/hermes-yolo-lean-context.js" "$HOME/.hermes/hermes-yolo-lean-context.js"
  fi
  install -m 0755 "$ROOT/tools/hermes-grok45-harness.js" "$HOME/.hermes/grok45/tools/hermes-grok45-harness.js"
  install -m 0755 "$ROOT/tools/hermes-economic-router.js" "$HOME/.hermes/grok45/tools/hermes-economic-router.js"
  install -m 0755 "$ROOT/tools/hermes-harness-eval.js" "$HOME/.hermes/grok45/tools/hermes-harness-eval.js"
  install -m 0755 "$ROOT/tools/hermes-outcome-gate.js" "$HOME/.hermes/grok45/tools/hermes-outcome-gate.js"
  install -m 0755 "$ROOT/tools/hermes-parallel-search.js" "$HOME/.hermes/grok45/tools/hermes-parallel-search.js"
  ln -sfn "$HOME/.hermes/grok45/grok-yolo-wrapper.js" "$HOME/.local/bin/grok-yolo"
  ln -sfn "$HOME/.hermes/hermes-yolo-wrapper.js" "$HOME/.local/bin/hermes-yolo"
  ln -sfn "$HOME/.hermes/grok45/tools/hermes-grok45-harness.js" "$HOME/.local/bin/hermes-grok45"
  ln -sfn "$HOME/.hermes/grok45/tools/hermes-economic-router.js" "$HOME/.local/bin/hermes-economic-router"
  ln -sfn "$HOME/.hermes/grok45/tools/hermes-harness-eval.js" "$HOME/.local/bin/hermes-harness-eval"
  ln -sfn "$HOME/.hermes/grok45/tools/hermes-outcome-gate.js" "$HOME/.local/bin/hermes-outcome-gate"
  ln -sfn "$HOME/.hermes/grok45/tools/hermes-parallel-search.js" "$HOME/.local/bin/hermes-parallel-search"
  ln -sfn "$HOME/.hermes/grok45/tools/hermes-parallel-search.js" "$HOME/.local/bin/hermes-search-turbo"
  pin_supergrok_launch_env
  # Post-install hard gate: installed file must still look like SuperGrok auto.
  if ! grep -q 'isGrokBackendReady' "$HOME/.hermes/hermes-yolo-wrapper.js" \
    || ! grep -q 'auto-supergrok-ready' "$HOME/.hermes/hermes-yolo-wrapper.js"; then
    echo "install-grok-yolo: installed wrapper failed SuperGrok gate" >&2
    return 1
  fi
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
  local wrapper_src
  wrapper_src="$(resolve_hermes_yolo_wrapper_src "$ROOT/hermes-yolo-wrapper.js")"
  ssh -o BatchMode=yes -o ConnectTimeout=8 "$host" 'mkdir -p "$HOME/.hermes/grok45/tools" "$HOME/.local/bin"'
  rsync -a "$ROOT/grok-yolo-wrapper.js" "$host:~/.hermes/grok45/grok-yolo-wrapper.js"
  rsync -a "$wrapper_src" "$host:~/.hermes/hermes-yolo-wrapper.js"
  rsync -a "$ROOT/tools/hermes-grok45-harness.js" "$host:~/.hermes/grok45/tools/hermes-grok45-harness.js"
  rsync -a "$ROOT/tools/hermes-economic-router.js" "$host:~/.hermes/grok45/tools/hermes-economic-router.js"
  rsync -a "$ROOT/tools/hermes-harness-eval.js" "$host:~/.hermes/grok45/tools/hermes-harness-eval.js"
  rsync -a "$ROOT/tools/hermes-outcome-gate.js" "$host:~/.hermes/grok45/tools/hermes-outcome-gate.js"
  rsync -a "$ROOT/tools/hermes-parallel-search.js" "$host:~/.hermes/grok45/tools/hermes-parallel-search.js"
  ssh -o BatchMode=yes -o ConnectTimeout=8 "$host" 'chmod 0755 "$HOME/.hermes/grok45/grok-yolo-wrapper.js" "$HOME/.hermes/hermes-yolo-wrapper.js" "$HOME/.hermes/grok45/tools/hermes-grok45-harness.js" "$HOME/.hermes/grok45/tools/hermes-economic-router.js" "$HOME/.hermes/grok45/tools/hermes-harness-eval.js" "$HOME/.hermes/grok45/tools/hermes-outcome-gate.js" "$HOME/.hermes/grok45/tools/hermes-parallel-search.js"; ln -sfn "$HOME/.hermes/grok45/grok-yolo-wrapper.js" "$HOME/.local/bin/grok-yolo"; ln -sfn "$HOME/.hermes/hermes-yolo-wrapper.js" "$HOME/.local/bin/hermes-yolo"; ln -sfn "$HOME/.hermes/grok45/tools/hermes-grok45-harness.js" "$HOME/.local/bin/hermes-grok45"; ln -sfn "$HOME/.hermes/grok45/tools/hermes-economic-router.js" "$HOME/.local/bin/hermes-economic-router"; ln -sfn "$HOME/.hermes/grok45/tools/hermes-harness-eval.js" "$HOME/.local/bin/hermes-harness-eval"; ln -sfn "$HOME/.hermes/grok45/tools/hermes-outcome-gate.js" "$HOME/.local/bin/hermes-outcome-gate"; ln -sfn "$HOME/.hermes/grok45/tools/hermes-parallel-search.js" "$HOME/.local/bin/hermes-parallel-search"; ln -sfn "$HOME/.hermes/grok45/tools/hermes-parallel-search.js" "$HOME/.local/bin/hermes-search-turbo"'
}

update_remote_grok() {
  local host="$1"
  ssh -o BatchMode=yes -o ConnectTimeout=8 "$host" 'grok_bin="$(command -v grok 2>/dev/null || true)"; if [ -z "$grok_bin" ]; then echo "install-grok-yolo: remote Grok Build binary is missing" >&2; exit 1; fi; "$grok_bin" update'
}

doctor_local() {
  echo "=== Local Grok Build doctor ($(hostname)) ==="
  "$HOME/.local/bin/grok-yolo" --doctor --json
}

doctor_remote() {
  local host="$1"
  echo "=== Remote Grok Build doctor ($host) ==="
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

echo "install-grok-yolo: local and remote Grok Build harnesses are ready"
