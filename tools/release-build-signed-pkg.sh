#!/usr/bin/env bash
# Build a Developer ID signed, notarized and stapled MacYoloSafeguards.pkg from a
# notarized MacYoloSafeguards.app. Direct downloads need "Developer ID Installer";
# the "3rd Party Mac Developer Installer" (Mac App Store) identity is rejected by
# Gatekeeper, which is how the v1.0.0 pkg shipped broken.
#
# Usage: tools/release-build-signed-pkg.sh <path/to/MacYoloSafeguards.app> <out.pkg>
# Signing uses ~/Library/Keychains/mys-signing.keychain-db; its password lives in the
# login keychain under service "mys-signing-keychain", so no prompt appears.
set -euo pipefail

APP="${1:?usage: $0 <MacYoloSafeguards.app> <out.pkg>}"
OUT="${2:?usage: $0 <MacYoloSafeguards.app> <out.pkg>}"
KC="${MYS_SIGNING_KEYCHAIN:-$HOME/Library/Keychains/mys-signing.keychain-db}"
ASC_KEY="${ASC_KEY_PATH:-$HOME/.appstoreconnect/private_keys/AuthKey_8URYJ3K256.p8}"
ASC_KEY_ID="${ASC_KEY_ID:-8URYJ3K256}"
ASC_ISSUER="${ASC_ISSUER_ID:-9e5d7ebf-d4fe-47c2-8370-14dd87c17113}"

spctl -a -t exec "$APP" >/dev/null 2>&1 || { echo "app is not notarized Developer ID: $APP" >&2; exit 1; }

security unlock-keychain -p "$(security find-generic-password -s mys-signing-keychain -w)" "$KC"
IDENTITY=$(security find-identity -v "$KC" | awk -F'"' '/Developer ID Installer/ {print $2; exit}')
[ -n "$IDENTITY" ] || { echo "no Developer ID Installer identity in $KC" >&2; exit 1; }

WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT
mkdir -p "$WORK/root"
ditto "$APP" "$WORK/root/$(basename "$APP")"
PLIST="$WORK/root/$(basename "$APP")/Contents/Info.plist"
pkgbuild --root "$WORK/root" --install-location /Applications \
  --identifier "$(defaults read "$PLIST" CFBundleIdentifier).pkg" \
  --version "$(defaults read "$PLIST" CFBundleShortVersionString)" "$WORK/component.pkg" >/dev/null
productbuild --package "$WORK/component.pkg" --sign "$IDENTITY" --keychain "$KC" --timestamp "$OUT"

xcrun notarytool submit "$OUT" --key "$ASC_KEY" --key-id "$ASC_KEY_ID" --issuer "$ASC_ISSUER" --wait
xcrun stapler staple "$OUT"
spctl -a -vv -t install "$OUT"
