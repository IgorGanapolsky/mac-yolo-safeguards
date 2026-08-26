#!/usr/bin/env bash
# GitButler MCP only after fleet-safe setup guard. Never prints tokens.
set -euo pipefail
SAFE="${GITBUTLER_SETUP_GUARD:-$HOME/.grok/skills/gitbutler-fleet-safe/scripts/assert_but_setup_safe.sh}"
TARGET="${1:-$PWD}"
if [[ ! -f "$SAFE" ]]; then
  echo "gitbutler-mcp-isolated: missing $SAFE" >&2
  exit 1
fi
if ! bash "$SAFE" "$TARGET"; then
  echo "gitbutler-mcp-isolated: setup guard refused $TARGET — use gh/GitHub MCP" >&2
  exit 1
fi
exec but mcp serve
