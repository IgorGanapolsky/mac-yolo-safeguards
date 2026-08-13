'use strict';

/**
 * tests/test-jcode-yolo-wrapper.js
 * Test suite for jcode-yolo zero-stall wrapper.
 */

const assert = require('assert');
const path = require('path');
const jcodeWrapper = require('../tools/jcode-yolo-wrapper');

console.log('🧪 Running Test Suite for jcode-yolo-wrapper...\n');

// Test 1: Configuration Resolution & Provider Sanitization
{
  const config = jcodeWrapper.resolveJcodeConfig({
    OPENROUTER_API_KEY: 'test-key',
    JCODE_DEFAULT_PROVIDER: 'openai',
  });
  assert.strictEqual(config.provider, 'openrouter');
  assert.strictEqual(config.model, 'bytedance-seed/seed-2-1-turbo');
  assert.strictEqual(config.openrouterKey, 'test-key');
  console.log('✅ Test 1 Passed: Provider Sanitization (openai -> openrouter)');
}

// Test 2: Doctor Probe
{
  const doc = jcodeWrapper.runDoctor(true);
  assert.strictEqual(doc.report.status, 'READY');
  assert.strictEqual(doc.report.provider, 'openrouter');
  console.log('✅ Test 2 Passed: Doctor Probe');
}

console.log('\n🎉 ALL JCODE-YOLO WRAPPER TESTS PASSED SUCCESSFULLY!');
