#!/usr/bin/env bash
# 22s App Store preview from captioned iPhone 6.7" frames (muted-first, H.264).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
FRAMES_DIR="$ROOT/fastlane/screenshots/en-US"
OUT="$ROOT/fastlane/app_previews/en-US/IPHONE_67_preview.mp4"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

if ! command -v ffmpeg >/dev/null 2>&1; then
  echo "Error: ffmpeg required" >&2
  exit 1
fi

FRAMES=()
while IFS= read -r line; do
  FRAMES+=("$line")
done < <(find "$FRAMES_DIR" -maxdepth 1 -name '*_67.png' | sort)
if ((${#FRAMES[@]} < 3)); then
  echo "Error: need *_67.png captioned frames in $FRAMES_DIR (run generate-store-screenshots.py first)" >&2
  exit 1
fi

# 4s × 6 frames = 24s (Apple preview window: 15–30s)
DURATION=4
FPS=30
LIST="$TMP/list.txt"
: >"$LIST"
for f in "${FRAMES[@]}"; do
  echo "file '$f'" >>"$LIST"
  echo "duration $DURATION" >>"$LIST"
done
LAST="${FRAMES[$((${#FRAMES[@]} - 1))]}"
echo "file '$LAST'" >>"$LIST"

mkdir -p "$(dirname "$OUT")"
ffmpeg -y -f concat -safe 0 -i "$LIST" \
  -f lavfi -i anullsrc=channel_layout=stereo:sample_rate=44100 \
  -vf "scale=886:1920:force_original_aspect_ratio=decrease,pad=886:1920:(ow-iw)/2:(oh-ih)/2:color=0x0B0F19,fps=$FPS" \
  -map 0:v:0 -map 1:a:0 -shortest \
  -c:v libx264 -profile:v high -level 4.0 -pix_fmt yuv420p -movflags +faststart \
  -c:a aac -b:a 256k -ar 44100 -ac 2 \
  "$OUT"

echo "Wrote $OUT ($(ffprobe -v error -show_entries format=duration -of csv=p=0 "$OUT")s)"
