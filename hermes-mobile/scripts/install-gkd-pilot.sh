#!/usr/bin/env bash
# Optional GKD pilot install for Hermes Mobile dogfood phones.
# Additive only — does NOT wire into continuous Maestro E2E.
# See hermes-mobile/docs/GKD-EVALUATION.md
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
RULES="$ROOT/tools/gkd/hermes-interruptors.json5"
GKD_PKG="li.songe.gkd"
GKD_VERSION="${GKD_VERSION:-v1.12.1}"
APK_NAME="gkd-${GKD_VERSION}.apk"
# Release assets are named gkd-v1.12.1.apk (version tag included).
APK_URL="${GKD_APK_URL:-https://github.com/gkd-kit/gkd/releases/download/${GKD_VERSION}/${APK_NAME}}"
CACHE_DIR="${TMPDIR:-/tmp}/hermes-gkd-pilot"
APK_PATH="$CACHE_DIR/$APK_NAME"

prefer_serial="${ANDROID_SERIAL:-}"
if [[ -z "$prefer_serial" ]]; then
  # Prefer physical USB device over emulator when both exist.
  prefer_serial="$(adb devices -l 2>/dev/null | awk '
    NR>1 && $2=="device" {
      serial=$1
      if ($0 !~ /emulator/) { print serial; exit }
      if (!emu) emu=serial
    }
    END { if (emu) print emu }
  ')"
fi

if [[ -z "$prefer_serial" ]]; then
  echo "No adb device in 'device' state. Plug in the phone (e.g. R3CY90QPM7E) and retry."
  exit 1
fi

export ANDROID_SERIAL="$prefer_serial"
echo "Using device: $ANDROID_SERIAL"

if [[ ! -f "$RULES" ]]; then
  echo "Missing rules file: $RULES"
  exit 1
fi

mkdir -p "$CACHE_DIR"
if [[ ! -f "$APK_PATH" ]]; then
  echo "Downloading $APK_URL"
  curl -fsSL -o "$APK_PATH" "$APK_URL"
fi

echo "Installing GKD APK…"
adb install -r "$APK_PATH"

REMOTE_DIR="/sdcard/Download/hermes-gkd"
adb shell mkdir -p "$REMOTE_DIR"
adb push "$RULES" "$REMOTE_DIR/hermes-interruptors.json5" >/dev/null
echo "Pushed rules → $REMOTE_DIR/hermes-interruptors.json5"

if adb shell pm path "$GKD_PKG" >/dev/null 2>&1; then
  echo "✓ $GKD_PKG installed on $ANDROID_SERIAL"
else
  echo "✗ $GKD_PKG not present after install"
  exit 1
fi

cat <<EOF

Next (one-time, on device — cannot be fully automated on locked OEM builds):
  1. Open GKD → enable Accessibility for li.songe.gkd
  2. 订阅 → 本地 → import $REMOTE_DIR/hermes-interruptors.json5
  3. Keep Hermes app groups DISABLED; only global interruptor groups ON
  4. DISABLE this subscription during fresh-user Maestro runs

Maestro remains the product E2E gate. Do not add GKD to LaunchAgents.
EOF
