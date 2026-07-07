#!/usr/bin/env bash
# Capture store screenshots via adb deep links on a REAL paired production build.
# Never uses hermes://setup?demo=1 — demo mode is Maestro-only and poisons dogfood sessions.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT_ANDROID="$ROOT/fastlane/metadata/android/en-US/images/phoneScreenshots"
OUT_IOS="$ROOT/fastlane/metadata/ios/en-US/screenshots"
DEVICE="${HERMES_ANDROID_DEVICE:-R3CY90QPM7E}"
PKG="com.iganapolsky.hermesmobile"
REPO="$(cd "$ROOT/.." && pwd)"

mkdir -p "$OUT_ANDROID" "$OUT_IOS"

open_link() {
  adb -s "$DEVICE" shell am start -a android.intent.action.VIEW -d "$1" "$PKG" >/dev/null 2>&1 || true
}

screencap() {
  local name="$1"
  local wait="${2:-3}"
  sleep "$wait"
  local path="/sdcard/hermes-store-${name}.png"
  adb -s "$DEVICE" shell screencap -p "$path"
  adb -s "$DEVICE" pull "$path" "$OUT_ANDROID/${name}.png" >/dev/null
  cp "$OUT_ANDROID/${name}.png" "$OUT_IOS/${name}.png"
  adb -s "$DEVICE" shell rm -f "$path" >/dev/null || true
  echo "captured $name ($(identify -format '%wx%h' "$OUT_ANDROID/${name}.png" 2>/dev/null || echo unknown))"
}

if ! adb -s "$DEVICE" get-state >/dev/null 2>&1; then
  echo "Error: device $DEVICE not connected" >&2
  exit 1
fi

if [[ -f "$ROOT/.release-apk-build.meta" ]]; then
  # shellcheck disable=SC1090
  source "$ROOT/.release-apk-build.meta"
  if [[ "${E2E_AUTOMATION:-}" == "1" ]]; then
    echo "Error: installed APK is E2E-tainted (demo mode enabled). Run: npm run android:phone" >&2
    exit 1
  fi
fi

echo "=== Pairing real gateway (no demo mode) ==="
node "$REPO/tools/hermes-mobile-pair.js" --no-serve
sleep 3

adb -s "$DEVICE" shell am force-stop "$PKG" || true
sleep 1
open_link "hermes://chat"
screencap "01_onboarding" 5
open_link "hermes://chat"
screencap "02_chat" 4
open_link "hermes://leash"
screencap "03_pro" 4
open_link "hermes://settings"
screencap "04_settings" 4

echo "Done — $OUT_ANDROID (production paired state, no demo)"
