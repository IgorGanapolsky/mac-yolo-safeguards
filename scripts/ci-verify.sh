#!/bin/sh
# Local mirror of GitHub Actions CI. Run from repo root before pushing.
set -eu

REPO="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO"

echo "=== JavaScript syntax ==="
git ls-files '*.js' | while IFS= read -r file; do
  node --check "$file"
done
node --check tools/hermes-contribution-opportunities.js
node --check tests/test-hermes-contribution-opportunities.js

echo "=== Shell syntax ==="
sh -n install.sh sim-runaway-guard.sh yolo-health tests/test-secondary-browser-reclaim.sh

echo "=== Guard E2E ==="
node tests/test-hermes-contribution-opportunities.js
tests/test-secondary-browser-reclaim.sh

echo "=== Public revenue checks ==="
node tools/public-conversion-check.js
node tools/public-funnel-safety-scan.js
node tools/public-command-reference-check.js
node tools/public-local-link-check.js
node tools/github-issue-template-check.js
node tools/publication-readiness.js

echo "=== Secret smoke scan ==="
GITHUB_PAT_PREFIX="gh""p_"
STRIPE_LIVE_PREFIX="sk_""live_"
TELEGRAM_TOKEN_NAME="TELEGRAM_""BOT_TOKEN"
STRIPE_SECRET_NAME="STRIPE_""SECRET_KEY"
SECRET_PATTERN="(${GITHUB_PAT_PREFIX}[A-Za-z0-9_]+|${STRIPE_LIVE_PREFIX}[A-Za-z0-9_]+|${TELEGRAM_TOKEN_NAME}=|${STRIPE_SECRET_NAME}=sk_)"
! git grep -nE "$SECRET_PATTERN" \
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
