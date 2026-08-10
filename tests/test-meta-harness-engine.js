'use strict';

const assert = require('assert');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { MetaHarnessEngine } = require('../tools/meta-harness-engine');

console.log('=== Testing Meta-Harness Outer-Loop Engine (arXiv:2603.28052v1) ===');

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'meta-harness-test-'));
try {
  // Create synthetic receipt for test
  const sampleReceipt = {
    timestamp: new Date().toISOString(),
    durationMs: 1200,
    execution: { status: 'pass' },
    provider: { provider: 'openai', fallbackUsed: false },
  };
  fs.writeFileSync(path.join(tmpDir, 'latest.json'), JSON.stringify(sampleReceipt));

  const engine = new MetaHarnessEngine({
    receiptDirs: [tmpDir],
    cacheDir: path.join(tmpDir, 'cache'),
  });

  const proposal = engine.runOptimizationStep();
  assert.strictEqual(proposal.version, '1.0.0-metaharness');
  assert.strictEqual(proposal.harnessParameters.timeoutMs, 90000);
  assert.strictEqual(proposal.optimizationMetrics.processedTraces, 1);

  console.log('✅ Meta-Harness Outer-Loop Engine Unit Tests PASSED!');
} finally {
  fs.rmSync(tmpDir, { recursive: true, force: true });
}
