#!/usr/bin/env bash
# tools/launch-mac-yolo-menubar.sh
# Launches Mac YOLO from the protected canonical binary (~/.hermes/bin/MacYolo-Protected-V4)
# compiled from macos/MacYoloTranslucentHud.swift (window alpha 1, frosted NSVisualEffectView is the content view, 0.3s click-outside dismiss).
set -euo pipefail

CANONICAL_BIN="$HOME/.hermes/bin/MacYolo-Protected-V4"
APP_BUNDLE="/Applications/MacYoloSafeguards.app"
APP_BIN="$APP_BUNDLE/Contents/MacOS/MacYoloSafeguards"
CANONICAL_SWIFT="$HOME/workspace/mac-yolo-safeguards/macos/MacYoloTranslucentHud.swift"
REPO_SWIFT="$HOME/workspace/mac-yolo-safeguards/macos/MacYoloSafeguardsApp.swift"

ensure_canonical_binary() {
  mkdir -p "$HOME/.hermes/bin" "$APP_BUNDLE/Contents/MacOS" "$APP_BUNDLE/Contents/Resources/en.lproj" "$APP_BUNDLE/Contents/Resources/Base.lproj"
  if [[ -f "$CANONICAL_SWIFT" ]] && ! cmp -s "$CANONICAL_SWIFT" "$REPO_SWIFT"; then
    /usr/bin/chflags nouchg "$REPO_SWIFT" 2>/dev/null || true
    cp -f "$CANONICAL_SWIFT" "$REPO_SWIFT"
  fi
  if [[ ! -x "$CANONICAL_BIN" ]] || [[ "$CANONICAL_SWIFT" -nt "$CANONICAL_BIN" ]]; then
    /usr/bin/chflags nouchg "$CANONICAL_BIN" "$HOME/.hermes/bin/MacYoloSafeguards-purple-bento" 2>/dev/null || true
    /usr/bin/chflags -R nouchg "$APP_BUNDLE" 2>/dev/null || true
    /usr/bin/swiftc -O -framework Cocoa -framework CoreGraphics -framework Foundation -framework WebKit \
      "$CANONICAL_SWIFT" -o "$APP_BIN"
    chmod +x "$APP_BIN"
    /usr/libexec/PlistBuddy -c "Set :CFBundleDisplayName 'Mac YOLO Safeguards'" "$APP_BUNDLE/Contents/Info.plist" 2>/dev/null || true
    /usr/libexec/PlistBuddy -c "Set :CFBundleName 'Mac YOLO Safeguards'" "$APP_BUNDLE/Contents/Info.plist" 2>/dev/null || true
    /usr/libexec/PlistBuddy -c "Add :LSHasLocalizedDisplayName bool true" "$APP_BUNDLE/Contents/Info.plist" 2>/dev/null || /usr/libexec/PlistBuddy -c "Set :LSHasLocalizedDisplayName true" "$APP_BUNDLE/Contents/Info.plist" 2>/dev/null || true
    printf '"CFBundleDisplayName" = "Mac YOLO Safeguards";\n"CFBundleName" = "Mac YOLO Safeguards";\n' > "$APP_BUNDLE/Contents/Resources/en.lproj/InfoPlist.strings"
    printf '"CFBundleDisplayName" = "Mac YOLO Safeguards";\n"CFBundleName" = "Mac YOLO Safeguards";\n' > "$APP_BUNDLE/Contents/Resources/Base.lproj/InfoPlist.strings"
    xattr -cr "$APP_BUNDLE" 2>/dev/null || true
    codesign --force --deep --sign - "$APP_BUNDLE" 2>/dev/null || true
    cp -f "$APP_BIN" "$CANONICAL_BIN"
    cp -f "$APP_BIN" "$HOME/.hermes/bin/MacYoloSafeguards-purple-bento"
    chmod +x "$CANONICAL_BIN" "$HOME/.hermes/bin/MacYoloSafeguards-purple-bento"
  fi

  if [[ ! -f "$APP_BIN" ]] || ! cmp -s "$CANONICAL_BIN" "$APP_BIN"; then
    /usr/bin/chflags -R nouchg "$APP_BUNDLE" 2>/dev/null || true
    cp -f "$CANONICAL_BIN" "$APP_BIN"
    chmod +x "$APP_BIN"
  fi
}

ensure_canonical_binary
exec "$APP_BIN" "$@"
