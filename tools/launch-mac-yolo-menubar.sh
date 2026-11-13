#!/usr/bin/env bash
# tools/launch-mac-yolo-menubar.sh
# Launches Mac YOLO from the protected canonical binary (~/.hermes/bin/MacYolo-Protected-V4)
# compiled from macos/MacYoloTranslucentHud.swift (alpha = 0.85 see-through translucency + 0.3s click-outside dismiss).
set -euo pipefail

CANONICAL_BIN="$HOME/.hermes/bin/MacYolo-Protected-V4"
CANONICAL_BIN_SOURCE_DIGEST="$CANONICAL_BIN.source-sha256"
APP_BUNDLE="/Applications/MacYoloSafeguards.app"
APP_BIN="$APP_BUNDLE/Contents/MacOS/MacYoloSafeguards"
SCRIPT_REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CANONICAL_SWIFT="$SCRIPT_REPO/macos/MacYoloTranslucentHud.swift"
REPO_SWIFT="$SCRIPT_REPO/macos/MacYoloSafeguardsApp.swift"

ensure_canonical_binary() {
  local force_rebuild=0
  local is_self_test=0
  for arg in "$@"; do
    case "$arg" in
      --rebuild) force_rebuild=1 ;;
      *-self-test*|--render-pill-preview) is_self_test=1 ;;
    esac
  done

  mkdir -p "$HOME/.hermes/bin" "$APP_BUNDLE/Contents/MacOS" "$APP_BUNDLE/Contents/Resources"
  if [[ -f "$CANONICAL_SWIFT" ]] && ! cmp -s "$CANONICAL_SWIFT" "$REPO_SWIFT"; then
    /usr/bin/chflags nouchg "$REPO_SWIFT" 2>/dev/null || true
    cp -f "$CANONICAL_SWIFT" "$REPO_SWIFT"
  fi

  # Never recompile/re-sign /Applications/MacYoloSafeguards.app on routine *-self-test runs
  # if the canonical binary is already installed, because re-signing triggers macOS BTM checks.
  if [[ "$is_self_test" -eq 1 && "$force_rebuild" -eq 0 && -x "$CANONICAL_BIN" && -x "$APP_BIN" ]] && cmp -s "$CANONICAL_BIN" "$APP_BIN"; then
    return 0
  fi

  local source_digest=""
  if [[ -f "$CANONICAL_SWIFT" ]]; then
    source_digest="$(/usr/bin/shasum -a 256 "$CANONICAL_SWIFT" | /usr/bin/awk '{print $1}')"
  fi
  local built_digest=""
  if [[ -f "$CANONICAL_BIN_SOURCE_DIGEST" ]]; then
    built_digest="$(<"$CANONICAL_BIN_SOURCE_DIGEST")"
  fi
  if [[ "$force_rebuild" -eq 1 ]] || [[ ! -x "$CANONICAL_BIN" ]] || [[ -n "$source_digest" && "$source_digest" != "$built_digest" ]]; then
    /usr/bin/chflags -R nouchg "$APP_BUNDLE" 2>/dev/null || true
    local tmp_bin="/tmp/MacYoloSafeguards.build.$$"
    if /usr/bin/swiftc -O -framework Cocoa -framework CoreGraphics -framework Foundation -framework WebKit \
      "$CANONICAL_SWIFT" -o "$tmp_bin"; then
      chmod +x "$tmp_bin"
      rm -f "$CANONICAL_BIN" "$APP_BIN"
      cp -f "$tmp_bin" "$APP_BIN"
      chmod +x "$APP_BIN"
      rm -f "$tmp_bin"
      xattr -cr "$APP_BUNDLE" 2>/dev/null || true
      local sign_id="Developer ID Application: Igor Ganapolsky (9GMM26JC5X)"
      if ! /usr/bin/security find-identity -v -p codesigning 2>/dev/null | grep -qF "$sign_id"; then
        sign_id="-"
      fi
      codesign --force --deep --sign "$sign_id" -i com.igor.MacYoloSafeguards "$APP_BUNDLE" 2>/dev/null || true
      cp -f "$APP_BIN" "$CANONICAL_BIN"
      chmod +x "$CANONICAL_BIN"
      if [[ -n "$source_digest" ]]; then
        printf '%s\n' "$source_digest" > "$CANONICAL_BIN_SOURCE_DIGEST"
      fi
    elif [[ ! -x "$CANONICAL_BIN" ]]; then
      rm -f "$tmp_bin"
      echo "launch-mac-yolo-menubar: swiftc failed and no cached binary exists" >&2
      exit 1
    else
      rm -f "$tmp_bin"
      echo "launch-mac-yolo-menubar: swiftc failed; launching the cached binary" >&2
    fi
  fi

  if [[ ! -f "$APP_BIN" ]] || ! cmp -s "$CANONICAL_BIN" "$APP_BIN"; then
    /usr/bin/chflags -R nouchg "$APP_BUNDLE" 2>/dev/null || true
    rm -f "$APP_BIN"
    cp -f "$CANONICAL_BIN" "$APP_BIN"
    chmod +x "$APP_BIN"
  fi
}

ensure_canonical_binary "$@"
if [[ "${1:-}" == "--rebuild" ]]; then
  shift
fi
exec "$APP_BIN" "$@"
