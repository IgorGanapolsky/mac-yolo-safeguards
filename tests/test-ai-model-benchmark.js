'use strict';

/**
 * Unit Tests for AI Model Benchmark & Open-Weight Auditing Harness (`tools/ai-model-benchmark-harness.js`)
 * Compatible with node tests/test-*.js harness (uses node:assert).
 */

const assert = require('assert');
const { evaluateModel, BENCHMARK_WORKLOADS } = require('../tools/ai-model-benchmark-harness');

console.log('Running test-ai-model-benchmark.js...');

// Test 1: Benchmark suite workload count & properties
{
  assert.ok(BENCHMARK_WORKLOADS.length >= 3, 'Expected at least 3 benchmark workloads');
  const codeGenWorkload = BENCHMARK_WORKLOADS.find((w) => w.id === 'CODE_GEN_REFACTOR');
  assert.ok(codeGenWorkload, 'Missing CODE_GEN_REFACTOR workload');
}

// Test 2: evaluateModel returns clean metrics
{
  const evaluation = evaluateModel({
    modelId: 'qwen-3.8-max-preview',
    modelType: 'OPEN_WEIGHT_PREVIEW',
    reasoningLevel: 'high'
  });

  assert.strictEqual(evaluation.modelId, 'qwen-3.8-max-preview', 'Model ID mismatch');
  assert.strictEqual(evaluation.metrics.completionRatePercent, 100, 'Expected 100% completion rate');
  assert.ok(evaluation.metrics.totalLatencyMs > 0, 'Expected positive total latency');
  assert.ok(evaluation.metrics.totalCostUsd > 0, 'Expected positive token cost');
}

console.log('ok tests/test-ai-model-benchmark.js');
