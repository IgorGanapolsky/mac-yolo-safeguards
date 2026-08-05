'use strict';

/**
 * Unit tests for Stacked PR & Dead-Code Verifier
 */

const assert = require('assert');
const { getGitDiffStats, verifyPrStackHygiene } = require('../tools/pr-stack-verifier');

console.log('Testing Stacked PR Verifier...');

const stats = getGitDiffStats();
assert.strictEqual(typeof stats.ok, 'boolean', 'getGitDiffStats returns boolean ok field');
assert.ok(Array.isArray(stats.files), 'getGitDiffStats returns array of files');

const hygiene = verifyPrStackHygiene();
assert.strictEqual(typeof hygiene.ok, 'boolean', 'verifyPrStackHygiene returns boolean ok field');
assert.ok(Array.isArray(hygiene.checks), 'verifyPrStackHygiene returns array of checks');

console.log('✅ All test-pr-stack-verifier tests PASSED cleanly.');
