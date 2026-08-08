'use strict';

/**
 * Unit Tests for Understudy Distillation Engine (`tools/understudy-distillation-engine.js`)
 * Compatible with node tests/test-*.js harness (uses node:assert).
 */

const assert = require('assert');
const { benchmarkModelDistillation, runUnderstudyEngineDiagnostic } = require('../tools/understudy-distillation-engine');

console.log('Running test-understudy-distillation-engine.js...');

// Test 1: Distillation Evaluation
{
  const res = benchmarkModelDistillation('gpt-4o', 'qwen-2.5-72b');
  assert.strictEqual(res.baselineModel, 'gpt-4o', 'Expected baseline model === gpt-4o');
  assert.ok(res.totalCases > 0, 'Expected total cases > 0');
  assert.strictEqual(typeof res.meetsParityBar, 'boolean', 'Expected boolean parity check');
}

// Test 2: Full Diagnostic
{
  const diag = runUnderstudyEngineDiagnostic();
  assert.strictEqual(diag.overallRating, '10/10 (UNDERSTUDY_DISTILLATION_A_PLUS)', 'Expected Grade A+ rating');
}

console.log('ok tests/test-understudy-distillation-engine.js');
