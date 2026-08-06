'use strict';

/**
 * Unit tests for WorkOS Emulation & Failure-Injection Harness
 */

const assert = require('assert');
const { runEmulationTests } = require('../tools/workos-emulator-harness');

async function run() {
  console.log('Testing WorkOS Emulation & Failure-Injection Harness...');

  const report = await runEmulationTests();
  assert.strictEqual(report.ok, true, 'All WorkOS emulation tests returned ok=true');
  assert.strictEqual(report.passed, 4, '4 out of 4 tests passed');
  assert.strictEqual(report.total, 4, 'Total 4 tests');

  console.log('✅ All test-workos-emulator-harness tests PASSED cleanly.');
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
