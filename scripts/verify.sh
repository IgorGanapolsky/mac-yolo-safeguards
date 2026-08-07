#!/usr/bin/env bash
# scripts/verify.sh — Fast, transparent, local regression suite for mac-yolo-safeguards
set -euo pipefail

echo "=== Running Local Regression Suite (scripts/verify.sh) ==="

# 1. CodeQL & Hygiene Pattern Gate
node tools/codeql-pattern-gate.js --all || { echo "❌ CodeQL pattern gate failed"; exit 1; }

# 2. Local CI Audit
node tools/local-ci-dagger-act-engine.js --fast || { echo "❌ Local CI Audit failed"; exit 1; }

# 3. Unit Test Suites
node tests/test-thumbgate-spend-guard.js
node tests/test-obsidian-structured-context.js
node tests/test-specialist-plugin-scoping.js
node tests/test-moe-context-slicer.js
node tests/test-fde-workflow-learning.js
node tests/test-thumbgate-context-master.js
node tests/test-vllm-local-harness.js
node tests/test-tinker-model-fine-tuner.js
node tests/test-hermes-yolo-regression-guard.js

echo "✅ All Local CI Verification Checks Passed!"
