#!/bin/sh
# Local mirror of GitHub Actions CI. Run from repo root before pushing.
set -eu

REPO="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO"

echo "=== JavaScript syntax ==="
git ls-files '*.js' | while IFS= read -r file; do
  node --check "$file"
done

echo "=== Shell syntax ==="
sh -n install.sh sim-runaway-guard.sh yolo-health tests/test-secondary-browser-reclaim.sh

echo "=== Guard E2E ==="
tests/test-secondary-browser-reclaim.sh

echo "=== Public revenue checks ==="
node tools/public-conversion-check.js
node tools/public-funnel-safety-scan.js
node tools/public-command-reference-check.js
node tools/public-local-link-check.js
node tools/github-issue-template-check.js
node tools/publication-readiness.js

echo "=== Secret smoke scan ==="
! git grep -nE '(ghp_[A-Za-z0-9_]+|sk_live_[A-Za-z0-9_]+|TELEGRAM_BOT_TOKEN=|STRIPE_SECRET_KEY=sk_)' \
  -- ':!.github/workflows/ci.yml' ':!.github/workflows/internal-distribution.yml' ':!.github/workflows/store-release.yml'

echo "=== Hermes Mobile ==="
(
  cd hermes-mobile
  npm ci
  npm run release:check
  npm run typecheck
  EXPO_DOCTOR_ALLOW_NPX_DOWNLOAD=1 npm run doctor:expo
  npm run test:ci
)

echo "=== CI verify: PASS ==="
