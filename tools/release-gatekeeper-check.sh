#!/usr/bin/env bash
# Download every installer on a GitHub release and fail if Gatekeeper would block it
# for a stranger. Run before announcing a release.
#
# Usage: tools/release-gatekeeper-check.sh <tag> [owner/repo]
set -euo pipefail

TAG="${1:?usage: $0 <tag> [owner/repo]}"
REPO="${2:-IgorGanapolsky/mac-yolo-safeguards}"
WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT

gh release download "$TAG" -R "$REPO" -D "$WORK" -p '*.dmg' -p '*.pkg' -p '*.zip'
fail=0
check() {
  local label="$1"; shift
  if "$@" >/dev/null 2>&1; then echo "PASS $label"; else echo "FAIL $label"; fail=1; fi
}
for f in "$WORK"/*; do
  name=$(basename "$f")
  case "$name" in
    *.pkg) check "$name" spctl -a -t install "$f" ;;
    *.dmg) check "$name" spctl -a -t open --context context:primary-signature "$f" ;;
    *.zip)
      out="$WORK/x-$name"; ditto -x -k "$f" "$out"
      app=$(find "$out" -maxdepth 2 -name '*.app' | head -1)
      if [ -n "$app" ]; then check "$name" spctl -a -t exec "$app"; else echo "SKIP $name (no app inside)"; fi ;;
  esac
done
exit "$fail"
