'use strict';

/**
 * Unit Tests for Tiktoken Budget Estimator (`tools/tiktoken-budget-estimator.js`)
 * Compatible with node tests/test-*.js harness (uses node:assert).
 */

const assert = require('assert');
const { estimateTiktokenCount, truncateToTiktokenCap, runTiktokenPreflightAudit } = require('../tools/tiktoken-budget-estimator');

console.log('Running test-tiktoken-budget-estimator.js...');

// Test 1: Exact BPE token estimation
{
  const text = 'Hello world, testing OpenAI tiktoken BPE token counting logic.';
  const est = estimateTiktokenCount(text);
  assert.ok(est.tokens > 0, 'Expected positive token count');
  assert.ok(est.costUsd > 0, 'Expected positive cost in USD');
  assert.strictEqual(est.withinBudget, true, 'Expected text within 3,000 token budget');
}

// Test 2: Truncation Gate
{
  const longText = 'A'.repeat(5000);
  const truncated = truncateToTiktokenCap(longText, 200);
  assert.strictEqual(truncated.truncated, true, 'Expected truncation applied');
  assert.ok(truncated.finalTokens <= 250, 'Expected final token count capped');
}

// Test 3: Full Audit Diagnostic
{
  const diag = runTiktokenPreflightAudit();
  assert.strictEqual(diag.overallRating, '10/10 (TIKTOKEN_A_PLUS)', 'Expected 10/10 rating');
}

console.log('ok tests/test-tiktoken-budget-estimator.js');
