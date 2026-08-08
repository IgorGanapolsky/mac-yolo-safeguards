'use strict';

/**
 * Unit Tests for ThumbGate-Context Master Engine (`tools/thumbgate-context-master-engine.js`)
 * Compatible with node tests/test-*.js harness (uses node:assert).
 */

const assert = require('assert');
const { assembleContextPackage, REGISTRY_COMPONENTS } = require('../tools/thumbgate-context-master-engine');

console.log('Running test-thumbgate-context-master.js...');

const pkg = assembleContextPackage({ role: 'Planner', project: 'ThumbGate' });
assert.strictEqual(pkg.status, 'THUMBGATE_CONTEXT_ASSEMBLED', 'Expected ASSEMBLED status');
assert.strictEqual(pkg.grade, '10/10 (THUMBGATE_CONTEXT_MASTER_ACTIVE)', 'Expected 10/10 grade');
assert.strictEqual(pkg.registriesVerified, 12, 'Expected 12 registries verified');
assert.deepStrictEqual(pkg.components, REGISTRY_COMPONENTS, 'Expected exact 12 components match');
assert.strictEqual(pkg.contextPackage.tokenBudgetLimit, 3000, 'Expected 3000 token limit');

console.log('ok tests/test-thumbgate-context-master.js');
