#!/usr/bin/env bash
# scripts/verify.sh — Fast, transparent, local regression suite for mac-yolo-safeguards
set -euo pipefail

echo "=== Running Local Regression Suite (scripts/verify.sh) ==="

# 1. CodeQL & Hygiene Pattern Gate
node tools/codeql-pattern-gate.js --all || { echo "❌ CodeQL pattern gate failed"; exit 1; }

# 2. Local CI Audit
# 3. Unit Test Suites
node tests/test-linear-agent-skill-exporter.js
node tests/test-github-copilot-agent-harness.js
node tests/test-browseros-agent-harness.js
node tests/test-github-runner-roi-auditor.js
node tests/test-openrouter-workload-router.js
node tests/test-posthog-error-tracking-auditor.js
node tests/test-pr-backlog-janitor.js
node tests/test-jcode-harness-adapter.js
node tests/test-jcode-yolo.js
node tests/test-hermes-yolo.js

echo "✅ All Local CI Verification Checks Passed!"
