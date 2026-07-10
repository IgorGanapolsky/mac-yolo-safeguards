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
# Comma-separated subset: 02_block,03_standing,04_pair (default: all legacy raw frames)
STORE_FRAMES="${STORE_FRAMES:-01_approve,02_block,03_standing,04_pair,05_thumbgate,06_works}"

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

want_frame() {
  local needle="$1"
  [[ ",${STORE_FRAMES}," == *",${needle},"* ]]
}

swipe_up() {
  local times="${1:-1}"
  local w h
  read -r w h < <(adb -s "$DEVICE" shell wm size | awk -F'[: x]+' '/Physical size/{print $2,$3; exit}')
  w="${w:-1080}"
  h="${h:-2400}"
  local x=$((w / 2))
  local y1=$((h * 72 / 100))
  local y0=$((h * 28 / 100))
  local i
  for ((i = 0; i < times; i++)); do
    adb -s "$DEVICE" shell input swipe "$x" "$y1" "$x" "$y0" 350 >/dev/null
    sleep 0.6
  done
}

verify_leash_approval() {
  adb -s "$DEVICE" shell uiautomator dump /sdcard/hermes-ui.xml >/dev/null 2>&1 || true
  if adb -s "$DEVICE" shell "grep -q leash-thumbs-up /sdcard/hermes-ui.xml" 2>/dev/null; then
    echo "verify 02_block: approval card visible (leash-thumbs-up)"
    return 0
  fi
  echo "verify 02_block: WARN approval card not detected in UI dump" >&2
  return 1
}

verify_qr_pairing() {
  adb -s "$DEVICE" shell uiautomator dump /sdcard/hermes-ui.xml >/dev/null 2>&1 || true
  if adb -s "$DEVICE" shell "grep -Eq 'pair-qr-scanner-help|Scan local QR|QR' /sdcard/hermes-ui.xml" 2>/dev/null; then
    echo "verify 04_pair: QR pairing UI visible"
    return 0
  fi
  echo "verify 04_pair: WARN QR pairing UI not detected" >&2
  return 1
}


maestro_seed_leash_smoke() {
  if ! command -v maestro >/dev/null 2>&1; then
    echo "Maestro not installed — cannot seed leash smoke preview" >&2
    return 1
  fi
  echo "Maestro fallback: inject leash smoke approval card"
  maestro --device "$DEVICE" test "$ROOT/.maestro/store-capture-frames.yaml"
}

maestro_open_qr_pairing() {
  if ! command -v maestro >/dev/null 2>&1; then
    return 1
  fi
  echo "Maestro fallback: open Settings QR pairing scanner"
  maestro --device "$DEVICE" test "$ROOT/.maestro/store-capture-qr.yaml"
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

CAPTURE_OK=()
CAPTURE_FAIL=()

run_frame() {
  local frame="$1"
  shift
  if ! want_frame "$frame"; then
    return 0
  fi
  if "$@"; then
    CAPTURE_OK+=("$frame")
  else
    CAPTURE_FAIL+=("$frame")
  fi
}

capture_02_block() {
  open_link "hermes://leash?preview=smoke"
  sleep 2
  if ! verify_leash_approval; then
    maestro_seed_leash_smoke || true
    sleep 2
    verify_leash_approval || true
  fi
  screencap "02_block" 5
}

capture_03_standing() {
  open_link "hermes://leash?preview=smoke"
  sleep 2
  swipe_up 3
  screencap "03_standing" 4
}

capture_04_pair() {
  open_link "hermes://settings?pair=qr"
  sleep 3
  if ! verify_qr_pairing; then
    maestro_open_qr_pairing || true
    sleep 2
    verify_qr_pairing || true
  fi
  screencap "04_pair" 4
}

run_frame "02_block" capture_02_block
run_frame "03_standing" capture_03_standing
run_frame "04_pair" capture_04_pair'

if want_frame "01_approve"; then
  open_link "hermes://chat"
  screencap "01_approve" 5 && CAPTURE_OK+=("01_approve") || CAPTURE_FAIL+=("01_approve")
fi

if want_frame "05_thumbgate"; then
  open_link "hermes://chat"
  screencap "05_thumbgate" 4 && CAPTURE_OK+=("05_thumbgate") || CAPTURE_FAIL+=("05_thumbgate")
fi

if want_frame "06_works"; then
  open_link "hermes://settings"
  screencap "06_works" 5 && CAPTURE_OK+=("06_works") || CAPTURE_FAIL+=("06_works")
fi

echo "=== capture summary ==="
echo "ok: ${CAPTURE_OK[*]:-none}"
echo "fail: ${CAPTURE_FAIL[*]:-none}"
echo "Done — $OUT_ANDROID (production paired state, no demo)"

if ((${#CAPTURE_FAIL[@]} > 0)); then
  exit 1
fi
