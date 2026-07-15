#!/bin/sh
# OpenClaw-class one-command local Hermes path (does NOT install OpenClaw).
# Usage: bash scripts/hermes-local-launch.sh --status
#        bash scripts/hermes-local-launch.sh --install --json
set -eu
repo_dir="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
exec node "$repo_dir/tools/hermes-local-launch.js" "$@"
