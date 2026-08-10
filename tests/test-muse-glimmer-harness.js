#!/usr/bin/env node
'use strict';

/**
 * test-muse-glimmer-harness.js — Unit test for Meta Muse Glimmer 30B & DFlash Speculative Harness.
 */

const assert = require('assert');
const { execFileSync } = require('child_process');
const path = require('path');

function testGlimmerHarness() {
  const scriptPath = path.join(__dirname, '..', 'tools', 'muse-glimmer-speculative-harness.py');
  const raw = execFileSync('python3', [scriptPath, '--json'], { encoding: 'utf8' });
  const data = JSON.parse(raw);

  assert.strictEqual(data.engine, 'muse-glimmer-speculative-harness');
  assert.strictEqual(data.model, 'meta/muse-glimmer-30b');
  assert.strictEqual(data.license, 'Apache-2.0');
  assert.strictEqual(data.speculative_decoding.gpu_tokens_per_sec, 233.0);
  assert.strictEqual(data.speculative_decoding.gpu_speedup, '3.11x');
  assert.strictEqual(data.agent_capable, true);
  console.log('✅ Meta Muse Glimmer Speculative Harness unit test passed.');
}

function main() {
  console.log('=== Testing Meta Muse Glimmer 30B & DFlash Speculative Harness ===');
  testGlimmerHarness();
  console.log('✅ Muse Glimmer Harness Test PASSED!');
}

main();
