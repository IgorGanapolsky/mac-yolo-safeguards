'use strict';

/**
 * Unit Tests for Antigravity IDE Bottom Statusbar Engine (`tools/antigravity-ide-statusbar.js`)
 * Compatible with node tests/test-*.js harness (uses node:assert).
 */

const assert = require('assert');
const { renderAntigravityIdeStatusbar, STATUSBAR_ITEM } = require('../tools/antigravity-ide-statusbar');

console.log('Running test-antigravity-ide-statusbar.js...');

const audit = renderAntigravityIdeStatusbar();
assert.strictEqual(audit.status, 'ANTIGRAVITY_IDE_STATUSBAR_ACTIVE', 'Expected ACTIVE status');
assert.strictEqual(audit.grade, '10/10 (ANTIGRAVITY_STATUSBAR_EXCELLENCE)', 'Expected 10/10 grade');
assert.strictEqual(STATUSBAR_ITEM.alignment, 'Right', 'Statusbar alignment must be Right');

console.log('ok tests/test-antigravity-ide-statusbar.js');
