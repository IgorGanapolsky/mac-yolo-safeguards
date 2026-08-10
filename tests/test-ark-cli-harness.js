'use strict';

const assert = require('assert');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { ArkCliHarness } = require('../tools/ark-cli-harness');

console.log('=== Testing Volcengine Ark CLI (ark-cli) Harness ===');

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ark-test-'));
try {
  const harness = new ArkCliHarness({
    configPath: path.join(tmpDir, 'config.json'),
    apiKey: 'mock-ark-key-12345',
  });

  // 1. Check status
  const status = harness.checkStatus();
  assert.strictEqual(status.harnessReady, true);
  assert.strictEqual(status.apiKeyConfigured, true);
  assert(status.recommendedModels.includes('seed-2.1-pro'));

  // 2. Execute task fallback
  const result = harness.executeTask('Ping ByteDance Seed 2.1');
  assert.strictEqual(result.status, 'pass');
  assert.strictEqual(result.model, 'seed-2.1-pro');

  console.log('✅ Volcengine Ark CLI (ark-cli) Harness Tests PASSED!');
} finally {
  fs.rmSync(tmpDir, { recursive: true, force: true });
}
