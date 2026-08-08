'use strict';

/**
 * Unit Tests for Hermes-YOLO Anti-Regression Guard Engine (`tools/hermes-yolo-regression-guard-engine.js`)
 * Compatible with node tests/test-*.js harness (uses node:assert).
 */

const assert = require('assert');
const { auditHermesYoloRegressionGuard } = require('../tools/hermes-yolo-regression-guard-engine');

console.log('Running test-hermes-yolo-regression-guard.js...');

const audit = auditHermesYoloRegressionGuard();
assert.strictEqual(audit.status, 'HERMES_YOLO_REGRESSION_GUARD_PASS', 'Expected PASS status');
assert.strictEqual(audit.grade, '10/10 (HERMES_YOLO_PREVENTION_ACTIVE)', 'Expected 10/10 grade');
assert.strictEqual(audit.guards.defaultToolsetMemoryExcluded.pass, true, 'Memory must be excluded from default toolsets');
assert.strictEqual(audit.guards.maxOutputTokensThreshold.pass, true, 'Max tokens must be >= 8192');

console.log('ok tests/test-hermes-yolo-regression-guard.js');
