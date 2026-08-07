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
node tests/test-nvidia-agent-harness.js
node tests/test-tencent-agent-memory.js
node tests/test-understudy-distillation-engine.js
node tests/test-plan-verify-directive.js
node tests/test-thumbgate-pricing-scorecard.js
node tests/test-agent-doctor.js
node tests/test-inference-telemetry.js
node tests/test-antigravity-ide-statusbar.js
node tests/test-openai-vercel-plugin-spec.js
node tests/test-digg-agent-news-aggregator.js

echo "✅ All Local CI Verification Checks Passed!"
