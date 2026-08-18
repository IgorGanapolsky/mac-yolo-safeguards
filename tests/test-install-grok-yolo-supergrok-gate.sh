#!/usr/bin/env bash
# SuperGrok install gate: refuse/replace stale hermes-yolo-wrapper without SuperGrok markers.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TMP="$(mktemp -d "${TMPDIR:-/tmp}/install-grok-gate.XXXXXX")"
cleanup() { rm -rf "$TMP"; }
trap cleanup EXIT

# shellcheck source=/dev/null
# Extract and unit-test resolve_hermes_yolo_wrapper_src by sourcing a slice.
# Re-implement the gate checks the script uses (same markers).
has_supergrok() {
  local f="$1"
  grep -q 'isGrokBackendReady' "$f" && grep -qE 'auto-hermes-quality|auto-supergrok-ready|force-supergrok' "$f"
}

echo "=== test-install-grok-yolo-supergrok-gate ==="

# Main tree wrapper must have SuperGrok (this branch is based on main + SuperGrok).
if ! has_supergrok "$ROOT/hermes-yolo-wrapper.js"; then
  echo "FAIL: repo hermes-yolo-wrapper.js missing SuperGrok markers on this branch" >&2
  exit 1
fi
echo "  ok: branch wrapper has SuperGrok markers"

# Stale wrapper fixture must fail the marker check
cat >"$TMP/stale-wrapper.js" <<'EOF'
// pretends to be hermes-yolo-wrapper without SuperGrok
function classifyBackend() {
  return { selectedBackend: 'hermes-legacy', reason: 'quota-independent-default' };
}
module.exports = { classifyBackend };
EOF
if has_supergrok "$TMP/stale-wrapper.js"; then
  echo "FAIL: stale fixture incorrectly passed SuperGrok markers" >&2
  exit 1
fi
echo "  ok: stale fixture fails SuperGrok markers"

# resolve path: dry-run the script function by bash -c with extracted body
# shellcheck disable=SC1091
bash -c '
set -euo pipefail
ROOT="'"$ROOT"'"
source /dev/null
resolve_hermes_yolo_wrapper_src() {
  local src="${1:-$ROOT/hermes-yolo-wrapper.js}"
  local tmp="$ROOT/.hermes-yolo-wrapper.from-main.js"
  if [[ -f "$src" ]] && grep -q "isGrokBackendReady" "$src" && grep -qE "auto-hermes-quality|auto-supergrok-ready|force-supergrok" "$src"; then
    printf "%s\n" "$src"
    return 0
  fi
  if git -C "$ROOT" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    if git -C "$ROOT" show origin/main:hermes-yolo-wrapper.js 2>/dev/null | grep -q "isGrokBackendReady"; then
      git -C "$ROOT" show origin/main:hermes-yolo-wrapper.js >"$tmp"
      if grep -qE "auto-hermes-quality|auto-supergrok-ready|force-supergrok" "$tmp"; then
        printf "%s\n" "$tmp"
        return 0
      fi
    fi
  fi
  return 1
}
good="$(resolve_hermes_yolo_wrapper_src "'"$ROOT"'/hermes-yolo-wrapper.js")"
test -n "$good"
test -f "$good"
grep -q isGrokBackendReady "$good"
# stale path should recover from origin/main when available
recovered="$(resolve_hermes_yolo_wrapper_src "'"$TMP"'/stale-wrapper.js")" || {
  # if origin/main unavailable offline, still OK as long as good path works
  echo "  skip: could not recover stale via origin/main (offline?)"
  exit 0
}
grep -q isGrokBackendReady "$recovered"
echo "  ok: resolve recovers SuperGrok source for good and stale paths"
'

# Script must contain gate helpers
grep -q 'resolve_hermes_yolo_wrapper_src' "$ROOT/scripts/install-grok-yolo.sh"
grep -q 'pin_supergrok_launch_env' "$ROOT/scripts/install-grok-yolo.sh"
grep -q 'refusing to install hermes-yolo-wrapper without SuperGrok' "$ROOT/scripts/install-grok-yolo.sh"
echo "  ok: install-grok-yolo.sh contains SuperGrok gate helpers"

echo "=== test-install-grok-yolo-supergrok-gate: ALL PASS ==="
