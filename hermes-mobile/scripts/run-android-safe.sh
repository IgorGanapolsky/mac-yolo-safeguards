#!/usr/bin/env bash
# Block Metro-only debug installs on connected phones (black screen without Metro).
# Emulators / no adb device: delegate to expo run:android.
set -euo pipefail

HERMES_DIR="$(cd "$(dirname "$0")/.." && pwd)"

has_adb_device() {
  command -v adb >/dev/null 2>&1 &&
    adb devices 2>/dev/null | grep -v "List" | grep -E '[[:space:]]device$' | grep -q .
}

if has_adb_device; then
  echo "FATAL: npm run android refuses phone installs (Metro-only debug → black screen)." >&2
  echo "" >&2
  echo "  npm run android:phone" >&2
  echo "  bash scripts/install-phone-release.sh" >&2
  echo "" >&2
  echo "Phone installs require a release APK with an embedded JS bundle." >&2
  exit 1
fi

cd "$HERMES_DIR"
exec npx expo run:android "$@"
