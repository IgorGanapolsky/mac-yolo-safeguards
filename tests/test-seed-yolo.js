'use strict';

const assert = require('assert');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { SeedYoloWrapper } = require('../tools/seed-yolo-wrapper');

console.log('=== Testing seed-yolo Command & Harness Suite ===');

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'seed-yolo-test-'));
try {
  const wrapper = new SeedYoloWrapper({ receiptDir: tmpDir });

  // 1. Run seed-yolo execution
  const res = wrapper.run(['Refactor', 'multi-agent', 'harness', 'architecture']);
  assert.strictEqual(res.exitCode, 0);
  assert(res.receipt.thinkingAllocation.thinkingMode);
  assert.strictEqual(res.receipt.model, 'seed-2.1-pro');

  // 2. Verify Receipt written
  const latestPath = path.join(tmpDir, 'latest.json');
  assert.strictEqual(fs.existsSync(latestPath), true);
  const receipt = JSON.parse(fs.readFileSync(latestPath, 'utf8'));
  assert.strictEqual(receipt.model, 'seed-2.1-pro');

  console.log('✅ seed-yolo Command & Harness Suite Tests PASSED!');
} finally {
  fs.rmSync(tmpDir, { recursive: true, force: true });
}
