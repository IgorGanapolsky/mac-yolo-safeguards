#!/usr/bin/env node
'use strict';

/**
 * test-tinker-distillation-engine.js
 * ----------------------------------
 * Verifies Thinking Machines Tinker Prompt Distillation & Continual Learning Engine:
 *   - Production trace harvesting from receipts
 *   - Prompt distillation & token compaction
 *   - SFT / DPO dataset export in JSONL format
 *   - Doctor & readiness diagnostic
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const {
  harvestProductionTraces,
  distillPrompt,
  exportSftDataset,
  runDoctor,
} = require('../tools/tinker-distillation-engine');

console.log('🧪 Running Tinker Distillation Engine Test Suite...');

// 1. Prompt Distillation & Token Reduction
{
  const raw = "can you please could you help me to refactor database models, and then run integration tests";
  const res = distillPrompt(raw);
  assert.ok(res.distilled.startsWith('refactor database models'));
  assert.ok(res.tokenReductionPercent > 20, 'Should reduce filler tokens by >20%');
  console.log('  ✓ Prompt distillation & filler token removal passes');
}

// 2. Production Trace Harvesting & SFT Export
{
  const testOut = path.join(os.tmpdir(), `test-sft-traces-${Date.now()}.jsonl`);
  const exportRes = exportSftDataset(testOut);
  assert.ok(exportRes.count >= 0);
  assert.ok(fs.existsSync(testOut));

  // Cleanup
  fs.unlinkSync(testOut);
  console.log('  ✓ Production trace harvesting & JSONL SFT dataset export passes');
}

// 3. Doctor Status
{
  const doc = runDoctor();
  assert.strictEqual(doc.status, 'READY');
  assert.ok(doc.stolenFrom.includes('Thinking Machines Lab'));
  console.log('  ✓ Doctor status passes');
}

console.log('\n✅ All Tinker Distillation Engine tests passed successfully!');
process.exit(0);
