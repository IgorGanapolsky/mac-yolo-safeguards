#!/bin/sh
# Compatibility entrypoint for guarded private root-artifact repair.
set -eu

REPO="$(cd "$(dirname "$0")/.." && pwd)"
exec /bin/bash "$REPO/scripts/repo-hygiene-self-heal.sh" --repair --repo "$REPO" "$@"
