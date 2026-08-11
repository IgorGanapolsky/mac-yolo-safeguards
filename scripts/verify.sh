#!/usr/bin/env bash
# scripts/verify.sh — Fast, transparent, local regression suite for mac-yolo-safeguards
set -euo pipefail

echo "=== Running Local Regression Suite (scripts/verify.sh) ==="

# 1. CodeQL & Hygiene Pattern Gate
node tools/codeql-pattern-gate.js --all || { echo "❌ CodeQL pattern gate failed"; exit 1; }

# 2. Unit Test Suites
node tests/test-linear-agent-skill-exporter.js
node tests/test-all-yolo-symlink-integrity.js
node tests/test-ling3-tiny-harness.js

echo "✅ All Local CI Verification Checks Passed!"
