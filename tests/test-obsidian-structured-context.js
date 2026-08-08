'use strict';

/**
 * Unit Tests for Obsidian Structured Context Engine (`tools/obsidian-structured-context-engine.js`)
 * Compatible with node tests/test-*.js harness (uses node:assert).
 */

const assert = require('assert');
const { provisionObsidianVaultStructure, REQUIRED_VAULT_DIRS } = require('../tools/obsidian-structured-context-engine');

console.log('Running test-obsidian-structured-context.js...');

const audit = provisionObsidianVaultStructure();
assert.strictEqual(audit.status, 'OBSIDIAN_CONTEXT_VAULT_PROVISIONED', 'Expected PROVISIONED status');
assert.strictEqual(audit.grade, '10/10 (OBSIDIAN_STRUCTURED_CONTEXT_ACTIVE)', 'Expected 10/10 grade');
assert.strictEqual(audit.requiredDirs.length, 8, 'Expected 8 vault directories');
assert.deepStrictEqual(audit.requiredDirs, REQUIRED_VAULT_DIRS, 'Expected exact required directories match');

console.log('ok tests/test-obsidian-structured-context.js');
