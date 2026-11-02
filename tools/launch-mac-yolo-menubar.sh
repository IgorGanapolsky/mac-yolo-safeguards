#!/usr/bin/env bash
# tools/launch-mac-yolo-menubar.sh
# Launches Mac YOLO from the protected canonical binary (~/.hermes/bin/MacYolo-Protected-V4)
# compiled from macos/MacYoloTranslucentHud.swift (alpha = 0.85 see-through translucency + 0.3s click-outside dismiss).
set -euo pipefail

CANONICAL_BIN="$HOME/.hermes/bin/MacYolo-Protected-V4"
CANONICAL_BIN_SOURCE_DIGEST="$CANONICAL_BIN.source-sha256"
APP_BUNDLE="/Applications/MacYoloSafeguards.app"
APP_BIN="$APP_BUNDLE/Contents/MacOS/MacYoloSafeguards"
CANONICAL_SWIFT="$HOME/workspace/mac-yolo-safeguards/macos/MacYoloTranslucentHud.swift"
REPO_SWIFT="$HOME/workspace/mac-yolo-safeguards/macos/MacYoloSafeguardsApp.swift"

ensure_canonical_binary() {
  mkdir -p "$HOME/.hermes/bin" "$APP_BUNDLE/Contents/MacOS" "$APP_BUNDLE/Contents/Resources"
  if [[ -f "$CANONICAL_SWIFT" ]] && ! cmp -s "$CANONICAL_SWIFT" "$REPO_SWIFT"; then
    /usr/bin/chflags nouchg "$REPO_SWIFT" 2>/dev/null || true
    cp -f "$CANONICAL_SWIFT" "$REPO_SWIFT"
  fi
  local source_digest=""
  if [[ -f "$CANONICAL_SWIFT" ]]; then
    source_digest="$(/usr/bin/shasum -a 256 "$CANONICAL_SWIFT" | /usr/bin/awk '{print $1}')"
  fi
  local built_digest=""
  if [[ -f "$CANONICAL_BIN_SOURCE_DIGEST" ]]; then
    built_digest="$(<"$CANONICAL_BIN_SOURCE_DIGEST")"
  fi
  if [[ ! -x "$CANONICAL_BIN" ]] || [[ -n "$source_digest" && "$source_digest" != "$built_digest" ]]; then
    /usr/bin/chflags -R nouchg "$APP_BUNDLE" 2>/dev/null || true
    if /usr/bin/swiftc -O -framework Cocoa -framework CoreGraphics -framework Foundation -framework WebKit \
      "$CANONICAL_SWIFT" -o "$APP_BIN"; then
      chmod +x "$APP_BIN"
      xattr -cr "$APP_BUNDLE" 2>/dev/null || true
      codesign --force --deep --sign - "$APP_BUNDLE" 2>/dev/null || true
      cp -f "$APP_BIN" "$CANONICAL_BIN"
      chmod +x "$CANONICAL_BIN"
      if [[ -n "$source_digest" ]]; then
        printf '%s\n' "$source_digest" > "$CANONICAL_BIN_SOURCE_DIGEST"
      fi
    elif [[ ! -x "$CANONICAL_BIN" ]]; then
      echo "launch-mac-yolo-menubar: swiftc failed and no cached binary exists" >&2
      exit 1
    else
      echo "launch-mac-yolo-menubar: swiftc failed; launching the cached binary" >&2
    fi
  fi

  if [[ ! -f "$APP_BIN" ]] || ! cmp -s "$CANONICAL_BIN" "$APP_BIN"; then
    /usr/bin/chflags -R nouchg "$APP_BUNDLE" 2>/dev/null || true
    cp -f "$CANONICAL_BIN" "$APP_BIN"
    chmod +x "$APP_BIN"
  fi
}

ensure_canonical_binary
exec "$APP_BIN" "$@"
