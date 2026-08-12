'use strict';

const assert = require('assert');
const { spawnSync } = require('child_process');
const { runMilpSolverBenchmark } = require('../tools/milp-solver-benchmark-harness');

console.log('=== Testing MILP Open-Source Solver Benchmark Harness ===');

// Test 1: Programmatic Evaluation
const result = runMilpSolverBenchmark();
assert.strictEqual(result.overallStatus, '10/10 (SOLVER-AGNOSTIC ENGINE ACTIVE)');
assert.strictEqual(result.benchmarks.length, 5);
assert.strictEqual(result.defaultEngine, 'HiGHS (Open-Source LP/MILP)');

// Test 2: CLI JSON Mode
const run = spawnSync('node', ['tools/milp-solver-benchmark-harness.js', '--json'], { encoding: 'utf8' });
assert.strictEqual(run.status, 0, `milp-solver-benchmark-harness failed: ${run.stderr}`);

const data = JSON.parse(run.stdout);
assert.strictEqual(data.architecturePolicy.solverAgnosticInterface, true);
assert.strictEqual(data.architecturePolicy.confidentialDataUsed, false);

console.log('✅ MILP Open-Source Solver Benchmark Harness unit test passed.\n');
