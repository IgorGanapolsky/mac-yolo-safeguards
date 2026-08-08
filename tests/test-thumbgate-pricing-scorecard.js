'use strict';

/**
 * Unit Tests for ThumbGate.app Pricing Scorecard Engine (`tools/thumbgate-pricing-scorecard-engine.js`)
 * Compatible with node tests/test-*.js harness (uses node:assert).
 */

const assert = require('assert');
const { auditThumbGatePricingScorecard, THUMBGATE_PACKAGING } = require('../tools/thumbgate-pricing-scorecard-engine');

console.log('Running test-thumbgate-pricing-scorecard.js...');

const audit = auditThumbGatePricingScorecard();
assert.strictEqual(audit.status, 'THUMBGATE_PRICING_SCORECARD_ACTIVE', 'Expected ACTIVE status');
assert.strictEqual(audit.grade, '10/10 (THUMBGATE_SALES_EXCELLENCE)', 'Expected 10/10 grade');
assert.strictEqual(audit.weeklyScorecardMetrics.length, 8, 'Expected 8 weekly scorecard metrics');
assert.strictEqual(THUMBGATE_PACKAGING.better.recommended, true, 'Better package must be recommended default');

console.log('ok tests/test-thumbgate-pricing-scorecard.js');
