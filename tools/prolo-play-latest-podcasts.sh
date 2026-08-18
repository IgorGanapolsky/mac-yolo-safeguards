#!/usr/bin/env bash
# Prolo Ring host launcher — ANDROID ONLY.
# Opens Google/YouTube Music Podcasts on the phone (Galaxy R3CY90QPM7E) and
# plays the latest episode. NEVER opens Apple Music or Mac Podcasts.
# Wrapper for ~/Applications/Prolo Latest Podcasts.app and any host hotkey.
set -euo pipefail

REPO="$(cd "$(dirname "$0")/.." && pwd)"
exec "$REPO/bin/prolo-android-podcasts" "${1:-exec}"
