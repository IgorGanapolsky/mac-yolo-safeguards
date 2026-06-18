#!/usr/bin/env bash
# Verify APK is shippable Hermes Mobile Expo release (embedded bundle, correct package).
set -euo pipefail

APK_PATH="${1:-}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

if [[ -z "$APK_PATH" || ! -f "$APK_PATH" ]]; then
  echo "Usage: verify-apk-package.sh <path-to.apk>" >&2
  exit 1
fi

if ! command -v unzip >/dev/null 2>&1; then
  echo "unzip is required for APK verification" >&2
  exit 1
fi

node "$SCRIPT_DIR/verify-apk-package.cjs" "$APK_PATH"
