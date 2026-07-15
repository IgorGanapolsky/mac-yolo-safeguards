#!/usr/bin/env bash
# Full fresh-user E2E orchestration — brand-new install, both platforms when available.
#
# Verifies:
#   1) Cold start ConnectMacGate onboarding (no demo deep link)
#   2) Tab navigation without demo
#   3) Leash Pro upsell + IAP subscribe CTA (paid upgrade surface)
#
# Usage:
#   bash scripts/run-fresh-user-e2e.sh              # android emulator + ios simulator if present
#   bash scripts/run-fresh-user-e2e.sh --android-only
#   bash scripts/run-fresh-user-e2e.sh --ios-only
#   HERMES_FRESH_USER_FORCE=1 bash scripts/run-fresh-user-e2e.sh
#
# Install policy:
#   - Does NOT use hermes://setup?demo=1
#   - Clears app data for true fresh state
#   - Prefers release/e2e-test style installs without developer leash unlock
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HERMES_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
# shellcheck source=maestro-env.sh
source "$SCRIPT_DIR/maestro-env.sh"

cd "$HERMES_DIR"

PKG="${HERMES_ANDROID_PACKAGE:-com.iganapolsky.hermesmobile}"
IOS_BUNDLE="${HERMES_IOS_BUNDLE_ID:-com.iganapolsky.hermesmobile}"
FLOW="${HERMES_FRESH_USER_FLOW:-.maestro/fresh-user-suite.yaml}"
PROOF_DIR="${HERMES_FRESH_USER_PROOF_DIR:-docs/proofs/fresh-user-e2e-$(date -u +%Y%m%dT%H%M%SZ)}"
ANDROID_ONLY=0
IOS_ONLY=0
SKIP_INSTALL=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --android-only) ANDROID_ONLY=1; shift ;;
    --ios-only) IOS_ONLY=1; shift ;;
    --skip-install) SKIP_INSTALL=1; shift ;;
    --flow) FLOW="$2"; shift 2 ;;
    -h|--help)
      sed -n '2,25p' "$0" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    *) echo "unknown arg: $1" >&2; exit 2 ;;
  esac
done

mkdir -p "$PROOF_DIR"
RESULT_JSON="$PROOF_DIR/result.json"
echo "Proof dir: $PROOF_DIR"

if ! command -v maestro >/dev/null 2>&1; then
  echo "Maestro required: curl -fsSL https://get.maestro.mobile.dev | bash" >&2
  exit 1
fi

node scripts/validate-maestro-flows.js

android_ok=0
ios_ok=0
android_status="skipped"
ios_status="skipped"

run_android() {
  echo "=== Android fresh-user E2E ==="
  local device
  device="$(adb devices 2>/dev/null | awk 'NR>1 && $2=="device" {print $1; exit}')"
  if [[ -z "$device" ]]; then
    echo "No Android device/emulator — booting AVD if possible..."
    if [[ -x scripts/dev-emulator.sh ]]; then
      bash scripts/dev-emulator.sh --wipe --headless || true
      sleep 5
      device="$(adb devices 2>/dev/null | awk 'NR>1 && $2=="device" {print $1; exit}')"
    fi
  fi
  if [[ -z "$device" ]]; then
    android_status="skipped_no_device"
    echo "SKIP Android: no emulator/device"
    return 0
  fi
  echo "Android device: $device"

  # Always wipe app data for brand-new user state
  adb -s "$device" shell pm clear "$PKG" >/dev/null 2>&1 || true

  local is_emulator=0
  [[ "$device" == emulator-* ]] && is_emulator=1

  if [[ "$SKIP_INSTALL" != "1" ]]; then
    if [[ "$is_emulator" -eq 1 || "${HERMES_FRESH_USER_FORCE_INSTALL:-}" == "1" ]]; then
      # Emulator (or forced): install debug without E2E demo flags so ConnectMacGate shows.
      unset EXPO_PUBLIC_E2E_AUTOMATION || true
      unset EXPO_PUBLIC_HERMES_DEV_UNLOCK || true
      if [[ -f android/app/build/outputs/apk/debug/app-debug.apk ]]; then
        adb -s "$device" install -r android/app/build/outputs/apk/debug/app-debug.apk
      else
        echo "Building debug APK..."
        (cd android && ./gradlew assembleDebug -q)
        adb -s "$device" install -r android/app/build/outputs/apk/debug/app-debug.apk
      fi
    else
      # Physical phone: never stomp release with debug unless forced.
      if ! adb -s "$device" shell pm path "$PKG" >/dev/null 2>&1; then
        echo "App not installed on $device — set HERMES_FRESH_USER_FORCE_INSTALL=1 or npm run android:phone" >&2
        android_status="fail_no_install"
        return 1
      fi
      echo "Using existing install on $device (data cleared only)"
    fi
  fi

  # Metro for debug builds
  if ! curl -s -m 2 "http://localhost:8081/status" 2>/dev/null | grep -q packager; then
    echo "Starting Metro..."
    (npx expo start --port 8081 >/tmp/hermes-fresh-metro.log 2>&1 &)
    sleep 8
  fi
  adb -s "$device" reverse tcp:8081 tcp:8081 >/dev/null 2>&1 || true

  adb -s "$device" shell am force-stop "$PKG" || true
  sleep 1

  if maestro --device "$device" test "$FLOW" 2>&1 | tee "$PROOF_DIR/android-maestro.log"; then
    android_ok=1
    android_status="pass"
    echo "Android fresh-user: PASS"
  else
    android_status="fail"
    echo "Android fresh-user: FAIL" >&2
    adb -s "$device" exec-out screencap -p >"$PROOF_DIR/android-fail.png" 2>/dev/null || true
    return 1
  fi
}

run_ios() {
  echo "=== iOS fresh-user E2E ==="
  if ! command -v xcrun >/dev/null 2>&1; then
    ios_status="skipped_no_xcode"
    return 0
  fi
  local udid
  udid="$(xcrun simctl list devices booted 2>/dev/null | grep -Eo '[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}' | head -1 || true)"
  if [[ -z "$udid" ]]; then
    local name="${HERMES_SIM_NAME:-iPhone 17 Pro}"
    udid="$(xcrun simctl list devices available 2>/dev/null | grep "$name (" | head -1 | grep -Eo '[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}' || true)"
    if [[ -n "$udid" ]]; then
      xcrun simctl boot "$udid" 2>/dev/null || true
      open -a Simulator || true
      xcrun simctl bootstatus "$udid" -b 2>/dev/null || sleep 20
    fi
  fi
  if [[ -z "$udid" ]]; then
    ios_status="skipped_no_simulator"
    echo "SKIP iOS: no simulator"
    return 0
  fi
  echo "iOS simulator: $udid"

  if [[ "$SKIP_INSTALL" != "1" ]]; then
    # Fresh state
    xcrun simctl uninstall "$udid" "$IOS_BUNDLE" 2>/dev/null || true
    # Do NOT set EXPO_PUBLIC_E2E_AUTOMATION — stranger gate must show
    unset EXPO_PUBLIC_E2E_AUTOMATION || true
    unset EXPO_PUBLIC_HERMES_DEV_UNLOCK || true
    if ! xcrun simctl get_app_container "$udid" "$IOS_BUNDLE" app >/dev/null 2>&1; then
      echo "Installing iOS app (expo run:ios)..."
      npx expo run:ios --no-bundler --device "$udid" 2>&1 | tee "$PROOF_DIR/ios-install.log" || {
        ios_status="fail_install"
        return 1
      }
    fi
  else
    xcrun simctl terminate "$udid" "$IOS_BUNDLE" 2>/dev/null || true
    # clear container data for fresh-ish state
    xcrun simctl privacy "$udid" reset all "$IOS_BUNDLE" 2>/dev/null || true
  fi

  if ! curl -s -m 2 "http://localhost:8081/status" 2>/dev/null | grep -q packager; then
    (npx expo start --port 8081 >/tmp/hermes-fresh-metro.log 2>&1 &)
    sleep 8
  fi

  if maestro test "$FLOW" 2>&1 | tee "$PROOF_DIR/ios-maestro.log"; then
    ios_ok=1
    ios_status="pass"
    echo "iOS fresh-user: PASS"
  else
    ios_status="fail"
    echo "iOS fresh-user: FAIL" >&2
    xcrun simctl io "$udid" screenshot "$PROOF_DIR/ios-fail.png" 2>/dev/null || true
    return 1
  fi
}

failed=0
if [[ "$IOS_ONLY" != "1" ]]; then
  run_android || failed=1
fi
if [[ "$ANDROID_ONLY" != "1" ]]; then
  run_ios || failed=1
fi

cat >"$RESULT_JSON" <<EOF
{
  "at": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "flow": "$FLOW",
  "android": { "status": "$android_status", "pass": $android_ok },
  "ios": { "status": "$ios_status", "pass": $ios_ok },
  "freshUser": true,
  "demoDeepLink": false,
  "paidUpgradeSurface": "pro-upgrade-card + subscribe-thumbgate-leash-iap"
}
EOF
echo "Wrote $RESULT_JSON"
cat "$RESULT_JSON"

if [[ "$failed" -ne 0 ]]; then
  exit 1
fi
if [[ "$android_status" == "skipped_no_device" && "$ios_status" == skipped* ]]; then
  echo "Both platforms skipped — no device available" >&2
  exit 2
fi
echo "Fresh-user E2E orchestration complete."
exit 0
