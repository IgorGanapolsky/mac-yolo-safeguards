#!/usr/bin/env node
'use strict';

/**
 * test-modal-agent-sandbox-harness.js — Unit test for Modal Serverless Harness.
 */

const assert = require('assert');
const { execFileSync } = require('child_process');
const path = require('path');

function testModalHarness() {
  const scriptPath = path.join(__dirname, '..', 'tools', 'modal-agent-sandbox-harness.py');
  const raw = execFileSync('python3', [scriptPath, '--json'], { encoding: 'utf8' });
  const data = JSON.parse(raw);

  assert.strictEqual(data.engine, 'modal-agent-sandbox-harness');
  assert.strictEqual(data.free_tier_credits_usd, 30.0);
  assert.ok(Array.isArray(data.features));
  console.log('✅ Modal Agent Sandbox Harness unit test passed.');
}

function main() {
  console.log('=== Testing Modal Serverless Agent Sandbox Harness ===');
  testModalHarness();
  console.log('✅ Modal Harness Test PASSED!');
}

main();
