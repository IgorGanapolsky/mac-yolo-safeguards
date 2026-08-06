'use strict';

/**
 * Unit Tests for Context Engineering Harness (`tools/context-engineering-harness.js`)
 * Compatible with node tests/test-*.js harness (uses node:assert).
 */

const assert = require('assert');
const { execSync } = require('child_process');
const path = require('path');

console.log('Running test-context-engineering-harness.js...');

const rootDir = path.resolve(__dirname, '..');
const output = execSync('node tools/context-engineering-harness.js --json', {
  cwd: rootDir,
  encoding: 'utf8',
});

const parsed = JSON.parse(output);
assert.strictEqual(parsed.status, 'HF_CONTEXT_COURSE_FULL_COMPLIANCE', 'Expected full compliance status');
assert.strictEqual(parsed.contextEngineeringCompliance, '100%', 'Expected 100% compliance');
assert.strictEqual(parsed.units.unit1_skills.passRate, 100, 'Expected Unit 1 pass rate === 100');
assert.strictEqual(parsed.units.unit4_subagents.passRate, 100, 'Expected Unit 4 pass rate === 100');

console.log('ok tests/test-context-engineering-harness.js');
