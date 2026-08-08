'use strict';

/**
 * Unit Tests for Plan-Verify System Directive Engine (`tools/plan-verify-directive-engine.js`)
 * Compatible with node tests/test-*.js harness (uses node:assert).
 */

const assert = require('assert');
const { auditPlanVerifyDirective } = require('../tools/plan-verify-directive-engine');

console.log('Running test-plan-verify-directive.js...');

const audit = auditPlanVerifyDirective();
assert.strictEqual(audit.status, 'PLAN_VERIFY_DIRECTIVE_ACTIVE', 'Expected ACTIVE status');
assert.strictEqual(audit.grade, '10/10 (PLAN_VERIFY_EXCELLENCE)', 'Expected 10/10 grade');
assert.strictEqual(audit.metrics.honestyProtocolEnforced, true, 'Honesty Protocol must be enforced');

console.log('ok tests/test-plan-verify-directive.js');
