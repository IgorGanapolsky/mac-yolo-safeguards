'use strict';

const assert = require('assert');
const { spawnSync } = require('child_process');
const { evaluateVercelCliConnectors } = require('../tools/vercel-connect-cli-harness');

console.log('=== Testing Vercel Connect CLI Automation Harness ===');

// Test 1: Programmatic Evaluation
const result = evaluateVercelCliConnectors();
assert.strictEqual(result.overallStatus, '10/10 (VERCEL CLI CONNECTORS ACTIVE)');
assert.strictEqual(result.connectors.length, 5);

// Test 2: CLI JSON Mode
const run = spawnSync('node', ['tools/vercel-connect-cli-harness.js', '--json'], { encoding: 'utf8' });
assert.strictEqual(run.status, 0, `vercel-connect-cli-harness failed: ${run.stderr}`);

const data = JSON.parse(run.stdout);
assert.strictEqual(data.totalSupportedPresets, 100);
assert.strictEqual(data.roiSummary.terminalZeroGUIProvisioning, true);

console.log('✅ Vercel Connect CLI Automation Harness unit test passed.\n');
