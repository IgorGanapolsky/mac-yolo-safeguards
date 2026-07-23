#!/usr/bin/env bash
# Compatibility entrypoint. The canonical deterministic renderer now generates the
# Play feature graphic and all screenshot families together so copy cannot drift.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

python3 "$ROOT/scripts/generate-store-screenshots.py"
identify "$ROOT/fastlane/metadata/android/en-US/images/featureGraphic.png"
