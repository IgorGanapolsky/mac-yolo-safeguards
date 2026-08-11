'use strict';

// Unit suite exercises CLI plumbing only — no live inference. The dry-run
// flag must be set before the wrapper module is loaded.
process.env.SEED_YOLO_DRY_RUN = '1';

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
    assert.strictEqual(res.receipt.model, cli.model);
    assert.strictEqual(res.receipt.executedVia, 'dry-run');
    assert.strictEqual(res.receipt.status, 'pass');
    assert.strictEqual(res.receipt.thinkingAllocation.thinkingMode, 'deep_reasoning');

    // 4. Verify Receipt file written
    const latestPath = path.join(tmpDir, 'latest.json');
    assert.strictEqual(fs.existsSync(latestPath), true);
    const receipt = JSON.parse(fs.readFileSync(latestPath, 'utf8'));
    assert.strictEqual(receipt.model, cli.model);

    console.log('✅ seed-yolo Standalone ByteDance Seed CLI Suite Tests PASSED!');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

testSuite().catch((err) => {
  console.error('Test failure:', err);
  process.exit(1);
});
