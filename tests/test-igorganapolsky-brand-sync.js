/**
 * tests/test-igorganapolsky-brand-sync.js
 *
 * Tests Igor Ganapolsky brand sync & portfolio validation engine.
 */

'use strict';

const assert = require('assert');
const { BrandSyncEngine } = require('../tools/igorganapolsky_brand_sync');

console.log('--- Running Igor Ganapolsky Brand Sync Tests ---');

const engine = new BrandSyncEngine();

// Test 1: Portfolio Validation
console.log('Test 1: Validate Portfolio Structure & Links');
const result = engine.validatePortfolio();
assert.strictEqual(result.ok, true, `Expected valid portfolio, got missing: ${result.missingKeywords?.join(', ')}`);
assert.strictEqual(result.missingKeywords.length, 0);
assert.ok(result.checkedKeywords >= 8);
console.log('✓ Portfolio structure, ventures, and contact links validated');

console.log('\nAll Brand Sync tests passed successfully! 🎉');
