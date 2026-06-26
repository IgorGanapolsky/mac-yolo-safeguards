#!/usr/bin/env bash
# One command: QR + adb deep link to configure Hermes Mobile (no typing on phone).
set -euo pipefail
repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
exec node "$repo_root/tools/hermes-mobile-pair.js" --open "$@"
