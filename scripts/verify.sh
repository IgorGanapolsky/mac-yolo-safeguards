#!/usr/bin/env bash
# scripts/verify.sh — Fast, transparent, local regression suite for mac-yolo-safeguards
set -euo pipefail

echo "=== Running Local Regression Suite (scripts/verify.sh) ==="

# 0. Preflight: Enforce Executable Permissions on All YOLO Wrappers
chmod 755 tools/seed-yolo-wrapper.js tools/jcode-yolo-wrapper.js hermes-yolo-wrapper.js poolside-yolo tinker-yolo kimi-yolo opencode-yolo yolo-health 2>/dev/null || true

# 1. CodeQL & Hygiene Pattern Gate
node tools/codeql-pattern-gate.js --all || { echo "❌ CodeQL pattern gate failed"; exit 1; }

# 2. Unit Test Suites
node tests/test-linear-agent-skill-exporter.js
node tests/test-github-copilot-agent-harness.js
node tests/test-browseros-agent-harness.js
node tests/test-github-runner-roi-auditor.js
node tests/test-hermes-yolo.js
node tests/test-all-yolo-symlink-integrity.js
node tests/test-ling3-tiny-harness.js
node tests/test-databricks-quasi-agentic-pipeline.js
node tests/test-mongodb-high-roi-steals.js
node tests/test-mongodb-field-cto-rag-engine.js
node tests/test-github-copilot-framework-harness.js
node tests/test-apache-cloudberry-mpp-engine.js
node tests/test-bytedance-seedrealtime-harness.js

echo "✅ All Local CI Verification Checks Passed!"
