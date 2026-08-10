#!/usr/bin/env bash
set -euo pipefail

echo "=== Running Local Regression Suite (scripts/verify.sh) ==="
echo ""

node tools/codeql-pattern-gate.js --all
node tests/test-linear-agent-skill-exporter.js
node tests/test-github-copilot-agent-harness.js
node tests/test-browseros-agent-harness.js
node tests/test-github-runner-roi-auditor.js
node tests/test-hermes-yolo.js

echo "✅ All Local CI Verification Checks Passed!"
