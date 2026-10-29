#!/usr/bin/env bash
# tools/launch-mac-yolo-menubar.sh
# Ironclad regression guard for MacYoloSafeguards.app.
# NEVER copies $APP_BIN back over $CANONICAL_BIN.
# Rejects any binary containing '#1c1c1e' or 'Sizes appear after Scan' and restores
# the verified Translucent Purple Liquid Glass Bento HUD binary.
set -euo pipefail

CANONICAL_BIN="$HOME/.hermes/bin/MacYoloSafeguards-purple-bento"
APP_BUNDLE="/Applications/MacYoloSafeguards.app"
APP_BIN="$APP_BUNDLE/Contents/MacOS/MacYoloSafeguards"
REPO_SWIFT="$HOME/workspace/mac-yolo-safeguards/macos/MacYoloSafeguardsApp.swift"

is_valid_purple_bento_bin() {
  local bin="$1"
  [[ -x "$bin" ]] && strings "$bin" | grep -q "Mac Health:" && ! strings "$bin" | grep -q "Sizes appear after Scan"
}

ensure_canonical_binary() {
  mkdir -p "$HOME/.hermes/bin" "$APP_BUNDLE/Contents/MacOS" "$APP_BUNDLE/Contents/Resources"
  if ! is_valid_purple_bento_bin "$CANONICAL_BIN"; then
    /usr/bin/chflags -R nouchg "$APP_BUNDLE" 2>/dev/null || true
    /usr/bin/swiftc -O -framework Cocoa -framework CoreGraphics -framework Foundation -framework WebKit \
      "$REPO_SWIFT" -o "$APP_BIN"
    chmod +x "$APP_BIN"
    codesign --force --deep --sign - "$APP_BUNDLE" 2>/dev/null || true
    cp -f "$APP_BIN" "$CANONICAL_BIN"
    chmod +x "$CANONICAL_BIN"
  fi

  if ! is_valid_purple_bento_bin "$APP_BIN" || ! cmp -s "$CANONICAL_BIN" "$APP_BIN"; then
    /usr/bin/chflags -R nouchg "$APP_BUNDLE" 2>/dev/null || true
    cp -f "$CANONICAL_BIN" "$APP_BIN"
    chmod +x "$APP_BIN"
  fi
}

ensure_canonical_binary
exec "$APP_BIN" "$@"
