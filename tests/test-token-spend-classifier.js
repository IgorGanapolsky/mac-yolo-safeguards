'use strict';

/**
 * Unit Tests for Token Spend Classifier & Cost Per Accepted Task (`tools/token-spend-classifier.js`)
 * Compatible with node tests/test-*.js harness (uses node:assert).
 */

const assert = require('assert');
const { classifyTokenExecution, evaluateTokenPortfolio } = require('../tools/token-spend-classifier');

console.log('Running test-token-spend-classifier.js...');

// Test 1: Single token execution classification
{
  const exec = classifyTokenExecution({
    workflowName: 'Test Workflow',
    inputTokens: 1000,
    outputTokens: 200,
    costUsd: 0.0005,
    category: 'PRODUCE',
    acceptedTask: true
  });

  assert.strictEqual(exec.totalTokens, 1200, 'Expected 1200 total tokens');
  assert.strictEqual(exec.dollarsPerAcceptedTask, 0.0005, 'Expected $0.0005 per accepted task');
}

// Test 2: Portfolio evaluation & A+ 10/10 grade
{
  const portfolio = evaluateTokenPortfolio([
    { workflowName: 'Teach Task', inputTokens: 1000, outputTokens: 200, costUsd: 0.0005, category: 'TEACH', acceptedTask: true },
    { workflowName: 'Produce Task', inputTokens: 4000, outputTokens: 800, costUsd: 0.002, category: 'PRODUCE', acceptedTask: true },
    { workflowName: 'Spin Task', inputTokens: 100, outputTokens: 20, costUsd: 0.0001, category: 'SPIN', acceptedTask: false }
  ]);

  assert.ok(portfolio.summary.spinTokensPercent <= 10, 'Expected spin tokens <= 10%');
  assert.strictEqual(portfolio.summary.systemHealth, 'OPTIMAL_TOKEN_EFFICIENCY_A_PLUS', 'Expected A+ 10/10 grade');
}

console.log('ok tests/test-token-spend-classifier.js');
