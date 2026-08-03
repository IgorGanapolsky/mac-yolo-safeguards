#!/bin/bash
set -euo pipefail

if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

if ! command -v gh >/dev/null 2>&1; then
  apt-get update -qq
  apt-get install -y -qq gh
fi

TOKEN="${GH_TOKEN:-${GITHUB_TOKEN:-}}"
if [ -n "$TOKEN" ]; then
  echo "export GH_TOKEN=\"$TOKEN\"" >> "$CLAUDE_ENV_FILE"
fi
