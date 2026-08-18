#!/usr/bin/env node
/**
 * Test Suite for d-Matrix Keyformer & DIMC Inference Steals Engine
 */

const assert = require('node:assert/strict');
const test = require('node:test');
const { pruneContextKeyformer, routeDisaggregatedInference } = require('../tools/dmatrix_kv_pruner.js');

test('Keyformer prunes redundant logs and repeated lines', () => {
  const input = `
[info] Starting agent loop
[info] Polling status...
[info] Polling status...
[info] Polling status...
[info] Polling status...
[info] Polling status...
[info] Finished task
`;

  const result = pruneContextKeyformer(input);
  assert.ok(result.reductionPercent > 0);
  assert.ok(result.prunedText.includes('Keyformer collapsed'));
  assert.ok(result.prunedText.includes('Finished task'));
});

test('Keyformer compacts massive non-code JSON array dumps', () => {
  const bigArray = JSON.stringify(Array.from({ length: 50 }, (_, i) => ({ id: i, name: `item-${i}`, payload: 'x'.repeat(20) })));
  const input = `Here is the telemetry data: ${bigArray}\nEnd of response.`;

  const result = pruneContextKeyformer(input);
  assert.ok(result.reductionPercent > 30);
  assert.ok(result.prunedText.includes('_dmatrix_pruned'));
  assert.ok(result.prunedText.includes('End of response'));
});

test('Disaggregated router sends fast safety gates to zero-cost local metal/ollama', () => {
  const route = routeDisaggregatedInference({
    promptLength: 500,
    isSafetyGate: true,
    hasLocalOllama: true
  });

  assert.equal(route.stage, 'decode');
  assert.equal(route.target, 'local_metal_ollama');
  assert.equal(route.costPerM, 0.00);
  assert.ok(route.estimatedLatencyMs < 45);
});

test('Disaggregated router sends massive context ingestion to cached prefill', () => {
  const route = routeDisaggregatedInference({
    promptLength: 25000,
    isSafetyGate: false,
    isDecisionStep: false
  });

  assert.equal(route.stage, 'prefill');
  assert.equal(route.target, 'cloud_cached_prefill');
  assert.equal(route.costPerM, 0.007);
});
