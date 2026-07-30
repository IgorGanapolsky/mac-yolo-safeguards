'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { runEvalBenchmarkSuite } = require('../tools/eval-benchmark-suite');

test('eval benchmark suite runs and reports metrics across all 5 dimensions', () => {
  const root = path.join(__dirname, '..');
  const results = runEvalBenchmarkSuite({ cwd: root });

  assert.ok(results.timestamp);
  assert.equal(typeof results.durationMs, 'number');
  assert.equal(results.metrics.offlineEvals.status, 'pass');
  assert.equal(typeof results.metrics.regressionTesting.preventionRulesActive, 'number');
  assert.ok(results.metrics.onlineEvals.continuousE2EStatus);
  assert.equal(results.metrics.domainMetrics.codingTestsPassed, true);
});
