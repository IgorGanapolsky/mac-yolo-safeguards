#!/usr/bin/env bash
# Pre-flight: repo identity + dirty tree signal for ship-claim verifier.
set -euo pipefail

ROOT="${OPENMONO_WORKSPACE:-${OPENMONO_HOST_WORKSPACE:-$PWD}}"
cd "$ROOT"

echo "=== ship-claim pre-flight ==="
echo "root=$ROOT"
echo "date=$(date -u +%Y-%m-%dT%H:%M:%SZ)"
echo "user=$(whoami)"

if git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "branch=$(git branch --show-current 2>/dev/null || echo detached)"
  echo "head=$(git rev-parse --short HEAD 2>/dev/null || echo unknown)"
  echo "--- git status --short ---"
  git status --short --branch || true
else
  echo "WARN: not a git work tree"
fi

echo "scope=${SCOPE:-${scope:-repo-root}}"
echo "claim=${CLAIM:-${claim:-<unset>}}"
