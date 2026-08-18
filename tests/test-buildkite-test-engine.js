#!/usr/bin/env node
'use strict';

/**
 * test-buildkite-test-engine.js
 * ------------------------------
 * Verifies Buildkite Test Engine & Flaky Quarantine:
 *   - Quarantine status & registry
 *   - Auto-retry with quarantine guard
 *   - Test suite splitting across worker groups
 *   - Doctor check
 */

const assert = require('assert');
const {
  quarantineTest,
  unquarantineTest,
  runWithQuarantineGuard,
  splitTests,
  runDoctor,
} = require('../tools/buildkite-test-engine');

console.log('🧪 Running Buildkite Test Engine Test Suite...');

// 1. Quarantine & Unquarantine Lifecycle
{
  const item = quarantineTest('test-flaky-sample.js', 'Simulated network timeout');
  assert.strictEqual(item.testName, 'test-flaky-sample.js');
  assert.ok(item.consecutiveFlakes >= 1);

  const unq = unquarantineTest('test-flaky-sample.js');
  assert.strictEqual(unq, true);
  console.log('  ✓ Quarantine & unquarantine lifecycle passes');
}

// 2. Retry Guard
{
  let count = 0;
  const flakyFn = () => {
    count++;
    if (count < 2) throw new Error('Transient flake');
  };

  const res = runWithQuarantineGuard('test-transient.js', flakyFn, 3);
  assert.strictEqual(res.passed, true);
  assert.strictEqual(res.retries, 1);
  assert.strictEqual(res.status, 'PASSED_ON_RETRY');
  console.log('  ✓ Flaky test auto-retry passes');
}

// 3. Test Suite Splitting
{
  const suites = ['test-1.js', 'test-2.js', 'test-3.js', 'test-4.js', 'test-5.js'];
  const groups = splitTests(suites, 2);
  assert.strictEqual(groups.length, 2);
  assert.strictEqual(groups[0].length, 3);
  assert.strictEqual(groups[1].length, 2);
  console.log('  ✓ Test suite splitting across workers passes');
}

// 4. Doctor Check
{
  const doc = runDoctor();
  assert.strictEqual(doc.status, 'READY');
  console.log('  ✓ Doctor check passes');
}

console.log('\n✅ All Buildkite Test Engine tests passed successfully!');
process.exit(0);
