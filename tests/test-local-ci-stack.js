'use strict';

/**
 * Unit Tests for Local CI, Dagger & `act` Engine (`tools/local-ci-dagger-act-engine.js`)
 * Compatible with node tests/test-*.js harness (uses node:assert).
 */

const assert = require('assert');
const { auditLocalCiStack } = require('../tools/local-ci-dagger-act-engine');

console.log('Running test-local-ci-stack.js...');

const audit = auditLocalCiStack();
assert.strictEqual(audit.status, 'LOCAL_CI_STACK_AUDITED', 'Expected AUDITED status');
assert.strictEqual(audit.grade, '10/10 (LOCAL_CI_STACK_ACTIVE)', 'Expected 10/10 grade');
assert.strictEqual(audit.pipeline.length, 10, 'Expected 10 pipeline stages');
assert.strictEqual(audit.tools.verifyScript, 'PRESENT', 'Expected verify.sh script to be PRESENT');

console.log('ok tests/test-local-ci-stack.js');
