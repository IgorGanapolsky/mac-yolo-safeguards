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
node --check tools/hermes-telegram-incident-audit.js
node --check tests/test-hermes-telegram-incident-audit.js
node --check tools/hermes-productivity-audit.js
node --check tests/test-hermes-productivity-audit-live-gate.js
node --check tools/hermes-project-routing-audit.js
node --check tests/test-hermes-project-routing-audit.js
node --check tools/hermes-governance-audit.js
node --check tests/test-hermes-governance-audit.js
node --check tools/hermes-gmail-outbox.js
node --check tests/test-hermes-gmail-outbox.js
node --check tools/media-content-ingest.js
node --check tests/test-media-content-ingest.js
node --check tools/openrouter-reasoning-plan.js
node --check tools/glm52-hermes-config.js
node --check tools/hermes-self-harness.js
node --check tools/merge-gateway-readiness.js
node --check tools/tencentdb-memory-readiness.js
node --check tools/athena-agent-revenue-gap.js
node --check tools/revenue-autonomous-loop.js
node --check tools/smart-ops-controller.js
node --check tools/hermes-hosting-market-signal.js
node --check tools/cash-discipline-board.js
node --check tools/graphify-readiness.js
node --check tools/openmono-roi-audit.js
node --check tools/kimi-model-upgrade-audit.js
node --check tests/test-openrouter-graphify-tools.js
node --check tests/test-glm52-hermes-config.js
node --check tests/test-hermes-self-harness.js
node --check tests/test-merge-gateway-readiness.js
node --check tests/test-tencentdb-memory-readiness.js
node --check tests/test-athena-agent-revenue-gap.js
node --check tests/test-cash-discipline-board.js
node --check tests/test-openmono-roi-audit.js
node --check tests/test-kimi-model-upgrade-audit.js
node --check tests/test-mac-text-hotkeys-config.js

echo "=== Shell syntax ==="
git ls-files '*.sh' | while IFS= read -r file; do
  case "$(head -n 1 "$file")" in
    *bash*) bash -n "$file" ;;
    *) sh -n "$file" ;;
  esac
done
sh -n yolo-health

echo "=== Python static checks ==="
python3 -c 'import ast, pathlib, subprocess; tracked=subprocess.check_output(["git", "ls-files", "*.py"], text=True).splitlines(); files=[path for path in tracked if pathlib.Path(path).is_file()]; [ast.parse(pathlib.Path(path).read_text(), filename=path) for path in files]; print(f"parsed {len(files)} Python files")'
if command -v ruff >/dev/null 2>&1; then
  git ls-files '*.py' | while IFS= read -r file; do test ! -f "$file" || printf '%s\n' "$file"; done | xargs ruff check --select F,E722
else
  echo "Ruff unavailable locally; CI installs the pinned ruff==0.15.20 gate"
fi

echo "=== Guard E2E ==="
node tests/test-hermes-contribution-opportunities.js
node tests/test-hermes-telegram-incident-audit.js
node tests/test-hermes-productivity-audit-live-gate.js
node tests/test-hermes-project-routing-audit.js
node tests/test-hermes-governance-audit.js
node tests/test-hermes-gmail-outbox.js
node tests/test-media-content-ingest.js
node tests/test-openrouter-graphify-tools.js
node tests/test-glm52-hermes-config.js
node tests/test-hermes-self-harness.js
node tests/test-merge-gateway-readiness.js
node tests/test-tencentdb-memory-readiness.js
node tests/test-athena-agent-revenue-gap.js
node tests/test-revenue-autonomous-loop.js
node tests/test-smart-ops-controller.js
node tests/test-hermes-hosting-market-signal.js
node tests/test-cash-discipline-board.js
node tests/test-openmono-roi-audit.js
node tests/test-kimi-model-upgrade-audit.js
tests/test-secondary-browser-reclaim.sh
tests/test-adb-reverse-device-filter.sh
if [ -f "$HOME/Documents/mac-text-hotkeys/init.lua" ]; then
  node tests/test-mac-text-hotkeys-config.js
else
  echo "Skipping mac-text-hotkeys config test: $HOME/Documents/mac-text-hotkeys/init.lua not present"
fi

echo "=== Public revenue checks ==="
node tools/public-conversion-check.js
node tools/public-funnel-safety-scan.js
node tools/public-command-reference-check.js
node tools/public-local-link-check.js
node tools/github-issue-template-check.js
node tools/publication-readiness.js

echo "=== Secret smoke scan ==="
GITHUB_PAT_PREFIX="gh""p_"
GITHUB_FINE_PAT_PREFIX="github""_pat_"
XAI_KEY_PREFIX="xai""-"
GOOGLE_API_KEY_PREFIX="AI""zaSy"
STRIPE_LIVE_PREFIX="sk_""live_"
TELEGRAM_TOKEN_NAME="TELEGRAM_""BOT_TOKEN"
STRIPE_SECRET_NAME="STRIPE_""SECRET_KEY"
GOOGLE_SIGNATURE_NAME="X-Goog-""Signature"
SECRET_PATTERN="(${GITHUB_PAT_PREFIX}[A-Za-z0-9_]+|${GITHUB_FINE_PAT_PREFIX}[A-Za-z0-9_]+|${XAI_KEY_PREFIX}[A-Za-z0-9_-]{20,}|${GOOGLE_API_KEY_PREFIX}[A-Za-z0-9_-]{20,}|${STRIPE_LIVE_PREFIX}[A-Za-z0-9_]+|${TELEGRAM_TOKEN_NAME}=|${STRIPE_SECRET_NAME}=sk_|${GOOGLE_SIGNATURE_NAME}=)"
! git grep -nE "$SECRET_PATTERN" \
  -- ':!.github/workflows/ci.yml' ':!.github/workflows/internal-distribution.yml' ':!.github/workflows/store-release.yml'

echo "=== Hermes Mobile ==="
(
  cd hermes-mobile
  npm install --no-audit --no-fund
  npm run release:check
  npm run typecheck
  EXPO_DOCTOR_ALLOW_NPX_DOWNLOAD=1 npm run doctor:expo
  npm run test:ci
  npm run test:release-safety
  if [ -f android/app/build/outputs/apk/release/app-release.apk ]; then
    npm run verify:apk -- android/app/build/outputs/apk/release/app-release.apk
  fi
)

echo "=== CI verify: PASS ==="
