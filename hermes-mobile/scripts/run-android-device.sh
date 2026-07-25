#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HERMES_MOBILE_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

cd "$HERMES_MOBILE_DIR"

echo "=== Android Physical Device Install ==="
HERMES_PHONE_FORCE=1 bash ./scripts/install-phone-release.sh

if [ -f "../tools/hermes-mobile-pair.js" ]; then
  echo "=== Auto-Pairing Android Device ==="
  node ../tools/hermes-mobile-pair.js || true
fi

echo "=== Done: Android physical device updated & launched ==="
