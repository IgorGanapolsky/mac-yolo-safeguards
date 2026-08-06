'use strict';

/**
 * Unit Tests for Obsidian & Linear Hygiene Engine (`tools/obsidian-linear-hygiene-engine.js`)
 * Compatible with node tests/test-*.js harness (uses node:assert).
 */

const assert = require('assert');
const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

console.log('Running test-obsidian-linear-hygiene.js...');

const rootDir = path.resolve(__dirname, '..');
const output = execSync('node tools/obsidian-linear-hygiene-engine.js --json', {
  cwd: rootDir,
  encoding: 'utf8',
});

const parsed = JSON.parse(output);
assert.strictEqual(parsed.obsidianVault.status, 'HYGIENE_OPTIMIZED', 'Expected Obsidian vault hygiene optimized status');
assert.strictEqual(parsed.linearGitHubSync.status, 'IN_SYNC', 'Expected Linear <-> GitHub in sync status');
assert.strictEqual(parsed.overallGrade, '10/10 (INTEGRATED_HYGIENE_PASSED)', 'Expected 10/10 grade');

// Verify SOULD.md no longer exists
const souldPath = '/Users/igorganapolsky/Documents/AI-Agent-Sync/SOULD.md';
assert.strictEqual(fs.existsSync(souldPath), false, 'Expected SOULD.md typo file to be deleted');

console.log('ok tests/test-obsidian-linear-hygiene.js');
