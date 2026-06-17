#!/usr/bin/env bash
# Verify an APK package matches the in-place upgrade ID (com.iganapolsky.agentleash).
set -euo pipefail

APK_PATH="${1:-}"
EXPECTED_PACKAGE="${HERMES_MOBILE_ANDROID_PACKAGE:-com.iganapolsky.agentleash}"

if [[ -z "$APK_PATH" || ! -f "$APK_PATH" ]]; then
  echo "Usage: verify-apk-package.sh <path-to.apk>" >&2
  exit 1
fi

if ! command -v aapt >/dev/null 2>&1; then
  echo "Installing aapt for APK package verification..." >&2
  sudo apt-get update -qq
  sudo DEBIAN_FRONTEND=noninteractive apt-get install -y -qq aapt >/dev/null
fi

ACTUAL_PACKAGE="$(
  aapt dump badging "$APK_PATH" 2>/dev/null | sed -n "s/^package: name='\\([^']*\\)'.*/\\1/p" | head -1
)"

if [[ -z "$ACTUAL_PACKAGE" ]]; then
  echo "Could not read package name from $APK_PATH" >&2
  exit 1
fi

echo "APK package: $ACTUAL_PACKAGE (expected: $EXPECTED_PACKAGE)"

if [[ "$ACTUAL_PACKAGE" != "$EXPECTED_PACKAGE" ]]; then
  echo "ERROR: Wrong Android package in APK." >&2
  echo "  expected: $EXPECTED_PACKAGE (Hermes Mobile Expo app)" >&2
  echo "  actual:   $ACTUAL_PACKAGE" >&2
  echo "This usually means Firebase FIREBASE_ANDROID_APP_ID points at the wrong Firebase app (e.g. AgentLeash)." >&2
  exit 1
fi

echo "APK package verification passed."
