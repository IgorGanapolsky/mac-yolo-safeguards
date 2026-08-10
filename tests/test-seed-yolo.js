'use strict';

const assert = require('assert');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { SeedAgentCli } = require('../tools/seed-yolo-wrapper');

console.log('=== Testing seed-yolo Standalone ByteDance Seed CLI Suite ===');

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'seed-yolo-test-'));

async function testSuite() {
  try {
    const cli = new SeedAgentCli({ receiptDir: tmpDir });

    // 1. Version check
    const ver = await cli.run(['--version']);
    assert.strictEqual(ver.exitCode, 0);

    // 2. Doctor check
    const doc = await cli.run(['doctor']);
    assert.strictEqual(doc.exitCode, 0);

    // 3. Prompt execution
    const res = await cli.run(['Refactor', 'multi-agent', 'harness', 'architecture']);
    assert.strictEqual(res.exitCode, 0);
    assert.strictEqual(res.receipt.model, 'bytedance/seed-2.1-pro');
    assert(res.receipt.thinkingAllocation.thinkingMode);

    // 4. Verify Receipt file written
    const latestPath = path.join(tmpDir, 'latest.json');
    assert.strictEqual(fs.existsSync(latestPath), true);
    const receipt = JSON.parse(fs.readFileSync(latestPath, 'utf8'));
    assert.strictEqual(receipt.model, 'bytedance/seed-2.1-pro');

    console.log('✅ seed-yolo Standalone ByteDance Seed CLI Suite Tests PASSED!');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

testSuite().catch((err) => {
  console.error('Test failure:', err);
  process.exit(1);
});
