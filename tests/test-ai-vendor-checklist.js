#!/usr/bin/env node
'use strict';

const assert = require('assert');
const { evaluateVendor } = require('../tools/ai-vendor-checklist');

console.log('Testing ai-vendor-checklist.js...');

const passAudit = evaluateVendor({
  vendor: 'Good Vetted Vendor',
  'model-card': 'yes',
  lineage: 'yes',
  governance: 'yes',
  safety: 'yes',
  'concrete-claims': 'yes',
});
assert.strictEqual(passAudit.score, 100);
assert.strictEqual(passAudit.status, 'APPROVED');

const failAudit = evaluateVendor({
  vendor: 'Fluffy AI Vendor',
  'model-card': 'no',
  lineage: 'no',
  governance: 'no',
  safety: 'no',
  'concrete-claims': 'no',
});
assert.strictEqual(failAudit.score, 0);
assert.strictEqual(failAudit.status, 'REJECTED (AI-WASHED)');

console.log('✅ ai-vendor-checklist.js test passed!');
