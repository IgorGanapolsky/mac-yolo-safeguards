#!/usr/bin/env bash
# Print ASC Apple ID password to stdout for piping into automation.
# Never log or commit the output.
set -euo pipefail
ACCOUNT="${ASC_APPLE_ID_ACCOUNT:-$(security find-generic-password -a hermes-fleet -s ASC_APPLE_ID_ACCOUNT -w 2>/dev/null || true)}"
ACCOUNT="${ACCOUNT:-igor.ganapolsky@icloud.com}"
/usr/bin/security find-generic-password -a "$ACCOUNT" -s "asc.apple-id" -w
