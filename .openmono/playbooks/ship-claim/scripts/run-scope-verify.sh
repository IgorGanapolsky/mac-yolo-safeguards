#!/usr/bin/env bash
# Scoped verification for ship-claim playbook. Exit non-zero on proof failure.
set -euo pipefail

ROOT="${OPENMONO_WORKSPACE:-${OPENMONO_HOST_WORKSPACE:-$PWD}}"
cd "$ROOT"

SCOPE="${SCOPE:-${scope:-repo-root}}"
CLAIM="${CLAIM:-${claim:-}}"

echo "=== ship-claim scope verify: $SCOPE ==="

case "$SCOPE" in
  docs-only)
    echo "--- docs-only: syntax + public checks (no hermes-mobile npm) ---"
    node --check tools/hermes-contribution-opportunities.js
    node tools/public-conversion-check.js
    node tools/public-funnel-safety-scan.js
    ;;
  hermes-mobile)
    echo "--- hermes-mobile release checks ---"
    (
      cd hermes-mobile
      npm ci
      npm run release:check
      npm run typecheck
      npm run test:ci
    )
    ;;
  repo-root)
    echo "--- full ci-verify mirror ---"
    bash scripts/ci-verify.sh
    ;;
  *)
    echo "ERROR: unknown scope: $SCOPE" >&2
    exit 2
    ;;
esac

# Optional: if claim mentions GitHub Actions / CI, surface latest workflow run.
if [[ "$CLAIM" == *[Cc][Ii]* || "$CLAIM" == *workflow* || "$CLAIM" == *GitHub* ]]; then
  echo "--- gh run list (internal-distribution, last 3) ---"
  if command -v gh >/dev/null 2>&1; then
    gh run list --workflow=internal-distribution.yml --limit 3 2>&1 || echo "WARN: gh run list failed"
  else
    echo "WARN: gh not installed — cannot verify CI claim"
  fi
fi

echo "=== scope verify: PASS ($SCOPE) ==="
