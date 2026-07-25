#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HERMES_MOBILE_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

cd "$HERMES_MOBILE_DIR"

echo "=== iOS Physical Device Install ==="

# Disable Sentry sourcemap upload for local device builds
export SENTRY_DISABLE_AUTO_UPLOAD=true
export SENTRY_AUTO_UPLOAD=false
export SENTRY_NO_UPLOAD=true
export SENTRY_SKIP_AUTO_RELEASE=true

# Get connected iOS device identifier
DEVICE_ID=$(xcrun devicectl list devices --json-output /tmp/devicectl_list.json 2>/dev/null | grep -o '"identifier" : "[^"]*"' | head -1 | cut -d'"' -f4 || echo "05E261A2-8EC4-5A2B-B752-F5632510D5B1")

echo "Target iOS Device: $DEVICE_ID"

# Build Release .app for physical device with isolated DerivedData (no Xcode GUI lock contention)
xcodebuild \
  -workspace ios/HermesMobile.xcworkspace \
  -scheme HermesMobile \
  -configuration Release \
  -destination "platform=iOS,id=$DEVICE_ID" \
  -derivedDataPath /tmp/hermes-mobile-derived-data \
  CODE_SIGN_STYLE=Automatic \
  DEVELOPMENT_TEAM=9GMM26JC5X \
  -allowProvisioningUpdates \
  -allowProvisioningDeviceRegistration \
  build

APP_PATH="/tmp/hermes-mobile-derived-data/Build/Products/Release-iphoneos/HermesMobile.app"

if [ ! -d "$APP_PATH" ]; then
  APP_PATH=$(find build/Build/Products -name "HermesMobile.app" | head -1)
fi

echo "Installing $APP_PATH onto $DEVICE_ID..."
xcrun devicectl device install app --device "$DEVICE_ID" "$APP_PATH"

echo "Launching com.iganapolsky.hermesmobile on $DEVICE_ID..."
xcrun devicectl device process launch --device "$DEVICE_ID" --terminate-existing com.iganapolsky.hermesmobile 2>/dev/null || xcrun devicectl device process launch --device "$DEVICE_ID" com.iganapolsky.hermesmobile

echo "=== Done: iPad / iOS physical device updated & launched ==="
