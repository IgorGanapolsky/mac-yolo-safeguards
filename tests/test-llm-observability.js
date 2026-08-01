'use strict';

const assert = require('assert');
const {
  logLLMCall,
  readLLMCalls,
  summarize,
  PRICING,
} = require('../tools/hermes-llm-observability.js');
const fs = require('fs');
const os = require('os');
const path = require('path');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed += 1;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    failed += 1;
    console.error(`  ✗ ${name}: ${err.message}`);
  }
}

// Use a temporary log file for tests to avoid polluting production data
const TEST_LOG = path.join(os.tmpdir(), 'test-llm-calls-' + Date.now() + '.jsonl');

// Monkey-patch the LOG_PATH used internally by logLLMCall
const obs = require('../tools/hermes-llm-observability.js');

console.log('\n=== LLM Observability Tests ===');

test('logLLMCall computes cost from pricing table', () => {
  // glm-5.2: $0.93/M input, $3.00/M output
  // 1000 prompt tokens + 500 completion tokens
  // expected: (1000/1M)*0.93 + (500/1M)*3.0 = 0.00093 + 0.0015 = 0.00243
  const record = logLLMCall({
    provider: 'custom:ollama-local-64k',
    model: 'glm-5.2',
    route: 'glm52_reasoning',
    promptTokens: 1000,
    completionTokens: 500,
    latencyMs: 1200,
    success: true,
  });
  assert.ok(record.costUsd > 0, 'cost should be positive for paid model');
  assert.ok(Math.abs(record.costUsd - 0.00243) < 0.0001,
    `cost should be ~0.00243, got ${record.costUsd}`);
});

test('logLLMCall computes zero cost for local models', () => {
  const record = logLLMCall({
    provider: 'custom:ollama-local-64k',
    model: 'qwen2.5:3b-64k',
    route: 'local_fast',
    promptTokens: 5000,
    completionTokens: 2000,
    latencyMs: 3000,
    success: true,
  });
  assert.strictEqual(record.costUsd, 0, 'local model cost should be 0');
});

test('logLLMCall handles cached prompt tokens (discount)', () => {
  // grok-4.5: $2.0/M input, $0.5/M cached, $6.0/M output
  // 1000 total prompt tokens, 500 of which are cached
  // effective input: 500 at $2.0, 500 cached at $0.5
  // (500/1M)*2.0 + (500/1M)*0.5 + (500/1M)*6.0 = 0.001 + 0.00025 + 0.003 = 0.00425
  const record = logLLMCall({
    provider: 'openrouter',
    model: 'grok-4.5',
    route: 'fusion',
    promptTokens: 1000,
    cachedPromptTokens: 500,
    completionTokens: 500,
    latencyMs: 800,
    success: true,
  });
  assert.ok(Math.abs(record.costUsd - 0.00425) < 0.0001,
    `cost with cache should be ~0.00425, got ${record.costUsd}`);
});

test('logLLMCall requires provider and model', () => {
  assert.throws(
    () => logLLMCall({ promptTokens: 100, completionTokens: 50, latencyMs: 500, success: true }),
    /provider and model/,
    'should throw without provider/model'
  );
});

test('logLLMCall requires token counts as numbers', () => {
  assert.throws(
    () => logLLMCall({ provider: 'test', model: 'test', promptTokens: 'abc', completionTokens: 50, latencyMs: 500, success: true }),
    /promptTokens and completionTokens/,
    'should throw with non-numeric tokens'
  );
});

test('logLLMCall records failed calls with error message', () => {
  const record = logLLMCall({
    provider: 'test',
    model: 'glm-5.2',
    route: 'test',
    promptTokens: 100,
    completionTokens: 0,
    latencyMs: 5000,
    success: false,
    error: 'Connection timeout',
  });
  assert.strictEqual(record.success, false);
  assert.strictEqual(record.error, 'Connection timeout');
});

test('summarize aggregates by model, route, and org', () => {
  // Create a temporary set of records
  const records = [
    { timestamp: Date.now(), provider: 'p1', model: 'glm-5.2', route: 'r1', organizationId: 'org-a', promptTokens: 100, completionTokens: 50, totalTokens: 150, costUsd: 0.001, latencyMs: 500, success: true, error: null },
    { timestamp: Date.now(), provider: 'p1', model: 'glm-5.2', route: 'r1', organizationId: 'org-a', promptTokens: 200, completionTokens: 100, totalTokens: 300, costUsd: 0.002, latencyMs: 600, success: false, error: 'timeout' },
    { timestamp: Date.now(), provider: 'p2', model: 'grok-4.5', route: 'r2', organizationId: 'org-b', promptTokens: 50, completionTokens: 25, totalTokens: 75, costUsd: 0.0005, latencyMs: 300, success: true, error: null },
  ];
  const summary = summarize(records);
  assert.strictEqual(summary.totalCalls, 3);
  assert.strictEqual(summary.totalTokens, 525);
  assert.ok(Object.keys(summary.byModel).length >= 2, 'should have at least 2 models');
  assert.ok(Object.keys(summary.byRoute).length >= 2, 'should have at least 2 routes');
  assert.ok(Object.keys(summary.byOrg).length >= 2, 'should have at least 2 orgs');
  assert.strictEqual(summary.byModel['glm-5.2'].calls, 2);
  assert.strictEqual(summary.byModel['grok-4.5'].calls, 1);
  assert.strictEqual(summary.byRoute['r1'].errors, 1);
});

test('summarize handles empty records', () => {
  const summary = summarize([]);
  assert.strictEqual(summary.totalCalls, 0);
  assert.strictEqual(summary.totalCostUsd, 0);
  assert.strictEqual(summary.successRate, 0);
});

test('summarize computes success rate correctly', () => {
  const records = [
    { timestamp: 1, provider: 'p', model: 'm', route: 'r', promptTokens: 1, completionTokens: 1, totalTokens: 2, costUsd: 0, latencyMs: 100, success: true, error: null },
    { timestamp: 2, provider: 'p', model: 'm', route: 'r', promptTokens: 1, completionTokens: 1, totalTokens: 2, costUsd: 0, latencyMs: 100, success: true, error: null },
    { timestamp: 3, provider: 'p', model: 'm', route: 'r', promptTokens: 1, completionTokens: 1, cachedPromptTokens: 0, totalTokens: 2, costUsd: 0, latencyMs: 100, success: false, error: 'err' },
  ];
  const summary = summarize(records);
  assert.strictEqual(summary.successRate, 66.7, '2 out of 3 success = 66.7%');
});

console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);
if (failed > 0) {
  process.exit(1);
}
