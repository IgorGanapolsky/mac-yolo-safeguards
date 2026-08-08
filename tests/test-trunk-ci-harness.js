'use strict';

/**
 * Unit tests for Trunk CI/CD Harness
 */

const assert = require('assert');
const { analyzeTestResults, runTrunkHarness } = require('../tools/trunk-ci-harness');

console.log('Testing Trunk CI/CD Harness...');

// Test 1: Baseline sample runs
const summary = runTrunkHarness();
assert.strictEqual(summary.ok, true, 'Harness returned ok=true');
assert.strictEqual(summary.flakyCount, 0, 'Zero flaky tests in baseline');
assert.strictEqual(summary.timeoutInflatedCount, 0, 'Zero timeout inflated tests in baseline');

// Test 2: Detection of flaky and timeout inflated runs
const mockRuns = [
  { name: 'slow-test', status: 'passed', durationMs: 6500, retries: 0, file: 'tests/slow.js' },
  { name: 'flaky-test', status: 'passed', durationMs: 300, retries: 2, file: 'tests/flaky.js' },
  { name: 'failing-test', status: 'failed', durationMs: 400, retries: 0, file: 'tests/failing.js', error: 'AssertionError: expected 1 to equal 2' }
];

const mockAnalysis = analyzeTestResults(mockRuns);
assert.strictEqual(mockAnalysis.timeoutInflatedCount, 1, 'Detected 1 timeout-inflated test');
assert.strictEqual(mockAnalysis.flakyCount, 1, 'Detected 1 flaky test');
assert.strictEqual(mockAnalysis.failingCount, 1, 'Detected 1 failing test');
assert.ok(mockAnalysis.prompts[0].prompt.includes('FIX TEST FAILURE'), 'Formatted AI copy prompt for failing test');

console.log('✅ All test-trunk-ci-harness tests PASSED cleanly.');
