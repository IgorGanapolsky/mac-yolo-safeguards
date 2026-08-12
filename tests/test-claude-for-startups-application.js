'use strict';

const assert = require('assert');
const { spawnSync } = require('child_process');
const { generateStartupApplication } = require('../tools/claude-for-startups-application');

console.log('=== Testing Claude for Startups Application Engine ===');

// Test 1: Programmatic Evaluation
const result = generateStartupApplication();
assert.strictEqual(result.overallStatus, '10/10 (APPLICATION STAGED & READY FOR DISPATCH)');
assert.strictEqual(result.application.founderName, 'Igor Ganapolsky');
assert.strictEqual(result.expectedBenefits.length, 3);

// Test 2: CLI JSON Mode
const run = spawnSync('node', ['tools/claude-for-startups-application.js', '--json'], { encoding: 'utf8' });
assert.strictEqual(run.status, 0, `claude-for-startups-application failed: ${run.stderr}`);

const data = JSON.parse(run.stdout);
assert.strictEqual(data.application.founderEmail, 'igor@igorganapolsky.com');

console.log('✅ Claude for Startups Application unit test passed.\n');
