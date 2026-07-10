#!/usr/bin/env bash
# Mandatory gate before editing ASC App Review notes or running Chrome ASC flows.
# Fails closed if live notes contain operator infra (tailnet, API keys, gateway URLs).
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HERMES_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$HERMES_DIR"

echo "▶ agent-pre-asc-edit: verify live ASC review notes are safe…"
if ! node scripts/verify-asc-listing.js >/tmp/hermes-asc-verify.json 2>/tmp/hermes-asc-verify.err; then
  cat /tmp/hermes-asc-verify.err >&2
  echo "✗ ASC review notes guard failed — run: node scripts/patch-asc-review-notes.js" >&2
  exit 1
fi

if command -v jq >/dev/null 2>&1; then
  safe="$(jq -r '.reviewNotes.safe // empty' /tmp/hermes-asc-verify.json 2>/dev/null || true)"
  if [[ "$safe" == "false" ]]; then
    echo "✗ reviewNotes.safe=false in verify-asc-listing output" >&2
    exit 1
  fi
fi

echo "✓ ASC review notes guard passed — use patch-asc-review-notes.js or ASC_SAFE_REVIEW_NOTES only"
echo "  Template: scripts/asc-review-notes-template.txt (demo: hermes://setup?demo=1)"
