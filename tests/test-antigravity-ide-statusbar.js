'use strict';

/**
 * Unit Tests for Antigravity IDE Statusbar Engine (`tools/antigravity-ide-statusbar-engine.js`)
 * Compatible with node tests/test-*.js harness (uses node:assert).
 */

const assert = require('assert');
const { auditAntigravityIdeStatusbar } = require('../tools/antigravity-ide-statusbar-engine');

console.log('Running test-antigravity-ide-statusbar.js...');

const audit = auditAntigravityIdeStatusbar({ promptTokens: 1250, genTokens: 310 });
assert.strictEqual(audit.status, 'ANTIGRAVITY_IDE_STATUSBAR_ACTIVE', 'Expected ACTIVE status');
assert.strictEqual(audit.tokenUsage.totalTokens, 1560, 'Expected 1560 total tokens');
assert.strictEqual(audit.costUsd, '$0.00', 'Cost must be $0.00');
assert.strictEqual(audit.harnessHealth.ciSuites, '23/23 PASS', 'Expected 23/23 CI suites');
assert.strictEqual(audit.harnessHealth.codeqlFindings, 0, 'Expected 0 CodeQL findings');

console.log('ok tests/test-antigravity-ide-statusbar.js');
