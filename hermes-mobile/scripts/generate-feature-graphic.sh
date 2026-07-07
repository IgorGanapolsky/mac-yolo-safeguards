#!/usr/bin/env bash
# Generate Play feature graphic v2 (1024x500) per docs/store-assets/FEATURE-GRAPHIC-v2.md
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$ROOT/fastlane/metadata/android/en-US/images/featureGraphic.png"
ICON="$ROOT/assets/icon.png"
FONT="/System/Library/Fonts/Supplemental/Arial Bold.ttf"
FONT_REG="/System/Library/Fonts/Supplemental/Arial.ttf"

magick -size 1024x500 xc:'#0B0F19' \
  \( "$ICON" -resize 160x160 \) -geometry +64+170 -composite \
  -font "$FONT" -pointsize 44 -fill '#F3F4F6' -annotate +280+200 'Approve AI agents from your phone' \
  -font "$FONT_REG" -pointsize 28 -fill '#9CA3AF' -annotate +280+250 'Stop runaway Cursor / Claude Code tools' \
  -font "$FONT" -pointsize 24 -fill '#22D3EE' -annotate +280+300 '★ Free approvals  ·  Leash Pro $19/mo' \
  "$OUT"

echo "Wrote $OUT"
identify "$OUT"
