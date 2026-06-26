#!/usr/bin/env bash
# Render Expo launcher assets from SVG masters (rsvg-convert or ImageMagick).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="$ROOT/assets/source"
OUT="$ROOT/assets"

render() {
  local input="$1"
  local output="$2"
  local size="${3:-1024}"
  if command -v rsvg-convert >/dev/null 2>&1; then
    rsvg-convert -w "$size" -h "$size" "$input" -o "$output"
  else
    magick -background none "$input" -resize "${size}x${size}" "$output"
  fi
}

echo "Generating Hermes Mobile launcher assets from $SRC"

# iOS / legacy Android: opaque square (no pre-rounded corners).
render "$SRC/icon-master.svg" "$OUT/icon.png" 1024

# Android adaptive foreground (transparent PNG; bg from app.json).
render "$SRC/adaptive-foreground.svg" "$OUT/adaptive-icon.png" 1024

# Android 13+ themed icon layer.
render "$SRC/adaptive-monochrome.svg" "$OUT/adaptive-monochrome.png" 1024

# Favicon / web.
render "$SRC/adaptive-foreground.svg" "$OUT/favicon.png" 48

echo "Wrote:"
ls -la "$OUT/icon.png" "$OUT/adaptive-icon.png" "$OUT/adaptive-monochrome.png" "$OUT/favicon.png"
