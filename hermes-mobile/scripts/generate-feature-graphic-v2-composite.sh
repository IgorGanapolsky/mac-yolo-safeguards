#!/usr/bin/env bash
# Feature graphic v2 — real device screenshot + typography (no AI fake UI).
# Output: docs/store-assets/higgsfield/feature-graphic-v2-composite-1024x500.png
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT_DIR="$ROOT/docs/store-assets/higgsfield"
SCREENSHOT="$ROOT/fastlane/metadata/android/en-US/images/phoneScreenshots/02_block.png"
ICON="$ROOT/assets/icon.png"
BG="${1:-}"  # optional Higgsfield abstract background PNG
OUT="$OUT_DIR/feature-graphic-v2-composite-1024x500.png"
FONT="/System/Library/Fonts/Supplemental/Arial Bold.ttf"
FONT_REG="/System/Library/Fonts/Supplemental/Arial.ttf"

mkdir -p "$OUT_DIR"

if [[ -n "$BG" && -f "$BG" ]]; then
  magick "$BG" -resize 1024x500^ -gravity center -extent 1024x500 "$OUT_DIR/_bg.png"
else
  magick -size 1024x500 radial-gradient:'#1a2744-#0B0F19' \
    -fill '#6366F1' -draw "circle 180,120 180,280" -channel A -evaluate multiply 0.15 +channel \
    "$OUT_DIR/_bg.png"
fi

# Phone mock: crop screenshot to phone area, resize, add subtle shadow
magick "$SCREENSHOT" -gravity North -crop 1080x1600+0+120 +repage \
  -resize 280x415 \
  \( +clone -background black -shadow 80x3+8+8 \) +swap -background none -layers merge +repage \
  "$OUT_DIR/_phone.png"

magick "$OUT_DIR/_bg.png" \
  \( "$OUT_DIR/_phone.png" \) -geometry +48+42 -composite \
  \( "$ICON" -resize 72x72 \) -geometry +48+42 -composite \
  -font "$FONT" -pointsize 42 -fill '#F3F4F6' -annotate +360+175 'Approve AI agents from your phone' \
  -font "$FONT_REG" -pointsize 26 -fill '#9CA3AF' -annotate +360+230 'Your Mac, not cloud credits' \
  -font "$FONT" -pointsize 22 -fill '#22D3EE' -annotate +360+280 '★ Free approvals  ·  Leash Pro $19/mo' \
  "$OUT"

rm -f "$OUT_DIR/_bg.png" "$OUT_DIR/_phone.png"
echo "Wrote $OUT"
identify "$OUT"
