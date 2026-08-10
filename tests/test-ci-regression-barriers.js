'use strict';

/**
 * Unit Tests for CI Regression Barriers Engine (`tools/ci-regression-barriers-engine.js`)
 * Compatible with node tests/test-*.js harness (uses node:assert).
 */

const assert = require('assert');
const { auditCiWorkflows } = require('../tools/ci-regression-barriers-engine');

console.log('Running test-ci-regression-barriers.js...');

const audit = auditCiWorkflows();
assert.strictEqual(audit.status, 'AUDITED', 'Expected AUDITED status');
assert.strictEqual(audit.monorepoMergeQueueTrigger, 'ACTIVE', 'Expected ACTIVE merge_group trigger');
assert.strictEqual(audit.regressionBarrierGrade, '10/10 (CI_REGRESSION_BARRIER_PROTECTED)', 'Expected 10/10 grade');

console.log('ok tests/test-ci-regression-barriers.js');
