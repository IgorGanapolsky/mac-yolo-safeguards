#!/usr/bin/env bash
# Production (or preview) EAS update — only after fresh-user / continuous E2E gate.
set -euo pipefail

CHANNEL="${1:-production}"
ENVIRONMENT="${2:-$CHANNEL}"
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$REPO_ROOT/hermes-mobile"

if [[ "$CHANNEL" == "production" ]]; then
  bash ./scripts/require-fresh-user-ota-gate.sh
fi

MSG="${OTA_MESSAGE:-gated OTA $(git -C "$REPO_ROOT" rev-parse --short HEAD 2>/dev/null || echo unknown)}"
eas update \
  --channel "$CHANNEL" \
  --environment "$ENVIRONMENT" \
  --non-interactive \
  --message "$MSG"
