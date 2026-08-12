#!/usr/bin/env node
'use strict';

const assert = require('assert');
const { TokenmaxxingRoiAuditor } = require('../tools/tokenmaxxing-roi-auditor');

console.log('=== Testing Anti-Tokenmaxxing & High-ROI Developer Value Auditor ===');

const auditor = new TokenmaxxingRoiAuditor();

// 1. High ROI Zero-Cost Receipt Audit
const highRoiReceipt = auditor.auditReceipt({
  prompt: 'Fix bug in verify.sh',
  tokensUsed: 600,
  costUsd: 0.0,
  verifierPassed: true,
  executedVia: 'seed-local-ollama',
});
assert.strictEqual(highRoiReceipt.verdict, 'HIGH_ROI');
assert.strictEqual(highRoiReceipt.isZeroCost, true);
assert.strictEqual(highRoiReceipt.efficiencyScore, 100.0);
console.log('✓ High ROI zero-cost receipt audit passed');

// 2. Tokenmaxxing Vanity Burn Penalty Audit
const vanityBurnReceipt = auditor.auditReceipt({
  prompt: 'A'.repeat(15000), // Prompt bloat
  tokensUsed: 25000,
  costUsd: 0.25, // Metered spend
  verifierPassed: false, // Failed run
});
assert.strictEqual(vanityBurnReceipt.verdict, 'TOKENMAXXING_VANITY_BURN');
assert.ok(vanityBurnReceipt.efficiencyScore < 50.0);
console.log('✓ Tokenmaxxing vanity burn interdiction audit passed');

// 3. Audit Report Generation Test
const report = auditor.generateAuditReport();
assert.strictEqual(report.auditedRuns, 2);
assert.strictEqual(report.zeroCostRoutePct, '100.0%');
console.log('✓ Audit report generation test passed');

console.log('✅ Anti-Tokenmaxxing & High-ROI Developer Value Auditor Unit Tests PASSED!');
