'use strict';

/**
 * tests/test-kimi-claw-harness.js
 * Test suite for Kimi Claw / OpenClaw harness.
 */

const assert = require('assert');
const path = require('path');
const kimiHarness = require('../tools/kimi-claw-harness');

console.log('🧪 Running Test Suite for kimi-claw-harness...\n');

// Test 1: Doctor Probe
{
  const doc = kimiHarness.runDoctor();
  assert.strictEqual(doc.status, 'READY');
  assert.ok(doc.platform.includes('OpenClaw'));
  assert.strictEqual(doc.contextLength, '1,000,000 tokens (1M)');
  console.log('✅ Test 1 Passed: Kimi Claw Doctor Probe');
}

console.log('\n🎉 ALL KIMI CLAW HARNESS TESTS PASSED SUCCESSFULLY!');
