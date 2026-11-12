#!/usr/bin/env bash
# Build, sign, notarize and staple MacYoloSafeguards.app plus the .dmg, .zip and .pkg for a
# GitHub release. The cleanup tools the app runs are copied into Contents/Resources/tools,
# so the app works on any Mac with Node.js, not only on a machine with this repo checked out.
#
# Usage: tools/release-build-app.sh <version> <build-number> <out-dir>
# Then:  gh release create v<version> <out-dir>/* && tools/release-gatekeeper-check.sh v<version>
set -euo pipefail

VERSION="${1:?usage: $0 <version> <build-number> <out-dir>}"
BUILD="${2:?usage: $0 <version> <build-number> <out-dir>}"
OUT="${3:?usage: $0 <version> <build-number> <out-dir>}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SIGN_ID="${MYS_APP_SIGN_ID:-Developer ID Application: Igor Ganapolsky (9GMM26JC5X)}"
ASC_KEY="${ASC_KEY_PATH:-$HOME/.appstoreconnect/private_keys/AuthKey_8URYJ3K256.p8}"
ASC_KEY_ID="${ASC_KEY_ID:-8URYJ3K256}"
ASC_ISSUER="${ASC_ISSUER_ID:-9e5d7ebf-d4fe-47c2-8370-14dd87c17113}"
TOOLS=(mac-yolo-disk-guard.js mac-yolo-agent-guard.js mac-yolo-jobs.js mac-yolo-system-care-engine.js agentic-graphrag-safeguard.js)

notarize() {
  local log
  log=$(xcrun notarytool submit "$1" --key "$ASC_KEY" --key-id "$ASC_KEY_ID" --issuer "$ASC_ISSUER" --wait)
  echo "$log" >&2
  [[ "$log" == *"status: Accepted"* ]]
}

WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT
APP="$WORK/stage/MacYoloSafeguards.app"
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources/tools" "$OUT"

/usr/bin/swiftc -O -target arm64-apple-macos14.0 \
  -framework Cocoa -framework CoreGraphics -framework Foundation -framework WebKit \
  "$ROOT/macos/MacYoloTranslucentHud.swift" -o "$APP/Contents/MacOS/MacYoloSafeguards"

cp "$ROOT/macos/bundle/Info.plist" "$APP/Contents/Info.plist"
plutil -replace CFBundleShortVersionString -string "$VERSION" "$APP/Contents/Info.plist"
plutil -replace CFBundleVersion -string "$BUILD" "$APP/Contents/Info.plist"
cp -R "$ROOT/macos/bundle/Base.lproj" "$ROOT/macos/bundle/en.lproj" "$APP/Contents/Resources/"
cp "$ROOT/macos/AppIcon.icns" "$APP/Contents/Resources/AppIcon.icns"
for t in "${TOOLS[@]}"; do cp "$ROOT/tools/$t" "$APP/Contents/Resources/tools/$t"; done

# The bundled tools must run on their own, with no repo next to them.
for t in mac-yolo-agent-guard.js; do
  node "$APP/Contents/Resources/tools/$t" clean >/dev/null
done
[[ "$("$APP/Contents/MacOS/MacYoloSafeguards" --health-self-test)" == *MAC_YOLO_HEALTH_OK* ]]
[[ "$("$APP/Contents/MacOS/MacYoloSafeguards" --net-self-test)" == *MAC_YOLO_NET_OK* ]]
[[ "$("$APP/Contents/MacOS/MacYoloSafeguards" --nudge-self-test)" == *MAC_YOLO_NUDGE_OK* ]]
[[ "$("$APP/Contents/MacOS/MacYoloSafeguards" --jobs-self-test)" == *MAC_YOLO_JOBS_OK* ]]

xattr -cr "$APP"
codesign --force --options runtime --timestamp --sign "$SIGN_ID" -i com.igor.MacYoloSafeguards "$APP"
codesign --verify --strict "$APP"

ditto -c -k --keepParent "$APP" "$WORK/notarize.zip"
notarize "$WORK/notarize.zip"
xcrun stapler staple "$APP"
spctl -a -t exec "$APP"

ditto -c -k --keepParent "$APP" "$OUT/MacYoloSafeguards.zip"

mkdir -p "$WORK/dmg"
ditto "$APP" "$WORK/dmg/MacYoloSafeguards.app"
ln -s /Applications "$WORK/dmg/Applications"
DMG="$OUT/MacYoloSafeguards-$VERSION.dmg"
hdiutil create -quiet -volname "Mac YOLO Safeguards" -srcfolder "$WORK/dmg" -ov -format UDZO "$DMG"
codesign --sign "$SIGN_ID" --timestamp "$DMG"
notarize "$DMG"
xcrun stapler staple "$DMG"

"$ROOT/tools/release-build-signed-pkg.sh" "$APP" "$OUT/MacYoloSafeguards.pkg"

(cd "$OUT" && shasum -a 256 "MacYoloSafeguards-$VERSION.dmg" MacYoloSafeguards.pkg MacYoloSafeguards.zip > SHA256SUMS)
cat "$OUT/SHA256SUMS"
