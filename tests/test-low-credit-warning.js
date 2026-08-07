'use strict';

/**
 * Unit Tests for Low Credit Warning Engine (`tools/low-credit-warning-engine.js`)
 * Compatible with node tests/test-*.js harness (uses node:assert).
 */

const assert = require('assert');
const { auditLowCreditWarnings, PROVIDERS } = require('../tools/low-credit-warning-engine');

console.log('Running test-low-credit-warning.js...');

const audit = auditLowCreditWarnings();
assert.strictEqual(audit.status, 'LOW_CREDIT_WARNING_ENGINE_ACTIVE', 'Expected ACTIVE status');
assert.strictEqual(audit.grade, '10/10 (CREDIT_SAFETY_EXCELLENCE)', 'Expected 10/10 grade');
assert.strictEqual(audit.autoFallbackActive, true, 'Auto local vLLM fallback must be active');
assert.strictEqual(PROVIDERS.length, 4, 'Expected 4 provider monitors');

console.log('ok tests/test-low-credit-warning.js');
