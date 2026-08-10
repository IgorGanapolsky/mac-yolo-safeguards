#!/usr/bin/env node
'use strict';

/**
 * test-jcode-harness-adapter.js — Unit regression test for jcode Harness Adapter.
 */

const assert = require('assert');
const { auditSubagentMemoryFootprint, runHarnessAdapter } = require('../tools/jcode-harness-adapter.js');

function testMemoryAudit() {
  const metrics = auditSubagentMemoryFootprint();
  assert.strictEqual(typeof metrics.rssMB, 'number');
  assert.strictEqual(metrics.engine, 'jcode-harness-adapter');
  assert.strictEqual(metrics.ramEfficiencyGainFactor, 8.8);
  console.log('✅ jcode memory audit unit test passed.');
}

async function main() {
  console.log('=== Testing jcode Ultra-Efficient Agent Harness Adapter ===');
  testMemoryAudit();
  await runHarnessAdapter({ json: false });
  console.log('✅ jcode Harness Adapter Test PASSED!');
}

main().catch((err) => {
  console.error(`Test failed: ${err.message}`);
  process.exit(1);
});
