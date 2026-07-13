#!/usr/bin/env bash
# Install GKD (accessibility rule tapper) + copy Hermes Mobile pilot subscription onto a USB phone.
# Additive to Maestro — does NOT replace hermes-mobile/.maestro/ continuous E2E.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SUBSCRIPTION="$ROOT/gkd/hermes-mobile-subscription.json"
CACHE_DIR="${HERMES_GKD_CACHE_DIR:-$HOME/.cache/hermes-mobile-gkd}"
GKD_VERSION="${HERMES_GKD_VERSION:-v1.12.1}"
GKD_APK_NAME="gkd-${GKD_VERSION#v}.apk"
GKD_APK_URL="${HERMES_GKD_APK_URL:-https://github.com/gkd-kit/gkd/releases/download/${GKD_VERSION}/${GKD_APK_NAME}}"
GKD_PKG="li.songe.gkd"
DEVICE_DIR="/sdcard/Download/hermes-gkd"

if ! command -v adb >/dev/null 2>&1; then
  echo "adb not found" >&2
  exit 1
fi

devices="$(adb devices | awk 'NR>1 && $2=="device" {print $1}')"
if [[ -z "${devices}" ]]; then
  echo "No USB Android device connected (adb devices empty)." >&2
  exit 2
fi

DEVICE="${HERMES_ADB_SERIAL:-$(echo "$devices" | head -n1)}"
echo "Using device: $DEVICE"

mkdir -p "$CACHE_DIR"
APK_PATH="$CACHE_DIR/$GKD_APK_NAME"
if [[ ! -f "$APK_PATH" ]]; then
  echo "Downloading $GKD_APK_URL"
  curl -fsSL -o "$APK_PATH" "$GKD_APK_URL"
fi

echo "Installing GKD $GKD_VERSION"
adb -s "$DEVICE" install -r "$APK_PATH"

if [[ ! -f "$SUBSCRIPTION" ]]; then
  echo "Missing subscription: $SUBSCRIPTION" >&2
  exit 1
fi

adb -s "$DEVICE" shell mkdir -p "$DEVICE_DIR"
adb -s "$DEVICE" push "$SUBSCRIPTION" "$DEVICE_DIR/hermes-mobile-subscription.json"
echo "Pushed subscription to $DEVICE_DIR/hermes-mobile-subscription.json"

cat <<EOF
GKD installed ($GKD_PKG).

Next (one-time on phone — accessibility cannot be granted via adb on stock Android):
1. Open GKD → enable Accessibility for GKD.
2. Subscription → Import local file → $DEVICE_DIR/hermes-mobile-subscription.json
3. Enable app rules for com.iganapolsky.hermesmobile

Docs: hermes-mobile/docs/GKD-TESTING.md
EOF
