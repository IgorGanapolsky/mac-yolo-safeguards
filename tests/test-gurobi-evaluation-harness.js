'use strict';

const assert = require('assert');
const { spawnSync } = require('child_process');
const { evaluateGurobiMilpEngine } = require('../tools/gurobi-evaluation-harness');

console.log('=== Testing Gurobi 0-1 MILP Evaluation & System-Wide Harness ===');

// Test 1: Programmatic Evaluation
const result = evaluateGurobiMilpEngine();
assert.strictEqual(result.overallStatus, '10/10 (GUROBI OPTIMIZER 13.0 ACTIVE & SYSTEM-WIDE INTEGRATED)');
assert.strictEqual(result.solverMetrics.status, 'OPTIMAL');
assert.strictEqual(result.solverMetrics.assigned_calls_count, 4);
assert.strictEqual(result.solverMetrics.objective_value, 6725);

// Test 2: CLI JSON Mode
const run = spawnSync('node', ['tools/gurobi-evaluation-harness.js', '--json'], { encoding: 'utf8' });
assert.strictEqual(run.status, 0, `gurobi-evaluation-harness failed: ${run.stderr}`);

const data = JSON.parse(run.stdout);
assert.strictEqual(data.systemWideConfig.gurobipyInstalled, true);
assert.strictEqual(data.systemWideConfig.highspyInstalled, true);

console.log('✅ Gurobi 0-1 MILP Evaluation Harness unit test passed.\n');
