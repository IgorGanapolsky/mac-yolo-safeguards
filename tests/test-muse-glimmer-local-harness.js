#!/usr/bin/env node
'use strict';

const assert = require('assert');
const { MuseGlimmerLocalHarness } = require('../tools/muse-glimmer-local-harness');

console.log('=== Testing Meta Muse Glimmer 30B Local Engine Harness ===');

async function runTests() {
  const harness = new MuseGlimmerLocalHarness({ modelName: 'muse-glimmer:30b' });

  // 1. Config Snippet Test
  const config = harness.generateConfigSnippet();
  assert.strictEqual(config.model, 'muse-glimmer:30b');
  assert.strictEqual(config.license, 'Apache-2.0');
  assert.strictEqual(config.costUsdPerToken, 0.0);
  console.log('✓ Config snippet generation test passed');

  // 2. Payload Construction Test
  const payload = harness.buildAgenticPayload('Debug memory leak in Node.js service');
  assert.strictEqual(payload.model, 'muse-glimmer:30b');
  assert.strictEqual(payload.messages.length, 2);
  assert.ok(payload.messages[0].content.includes('Meta Muse Glimmer'));
  console.log('✓ Agentic payload construction test passed');

  // 3. Health Probe Test
  const health = await harness.probeHealth();
  assert.strictEqual(typeof health.ready, 'boolean');
  console.log('✓ Health probe test passed');

  console.log('✅ Meta Muse Glimmer 30B Local Engine Unit Tests PASSED!');
}

runTests().catch((err) => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
