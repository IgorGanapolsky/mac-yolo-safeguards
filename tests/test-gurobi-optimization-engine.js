#!/usr/bin/env node
'use strict';

/**
 * Unit Test for Gurobi & HiGHS Dual-Engine Optimization Stack
 */

const assert = require('assert');
const path = require('path');
const {
  runGurobiOptimizationSuite,
  solveHiGHSModelWasm,
  solveKnapsackMILP,
  presolveLinearModel
} = require('/Users/igorganapolsky/.gemini/config/skills/gurobi-optimization-engine/gurobi-optimization-engine.js');

async function testGurobiEngine() {
  console.log('Testing Gurobi & HiGHS Dual-Engine Optimization Suite...');

  // 1. Test Suite Execution
  const suiteResult = runGurobiOptimizationSuite();
  assert.strictEqual(suiteResult.overallScore, '10/10 (A+ OPTIMAL)');
  assert.ok(suiteResult.solverEngine.includes('HiGHS WebAssembly'));
  console.log('✅ Gurobi Suite telemetry verified.');

  // 2. Test Presolve Engine
  const presolve = presolveLinearModel({
    variables: { x1: { lb: 0, ub: 1 }, x2: { lb: 2, ub: 2 } },
    constraints: [{ terms: { x1: 1, x2: 1 }, sense: '<=', rhs: 5 }]
  });
  assert.strictEqual(presolve.fixedVariables, 1);
  console.log('✅ Presolve matrix reduction verified.');

  // 3. Test Knapsack Solver
  const knapsack = solveKnapsackMILP([
    { id: 'item1', value: 60, weight: 10 },
    { id: 'item2', value: 100, weight: 20 },
    { id: 'item3', value: 120, weight: 30 }
  ], 50);
  assert.strictEqual(knapsack.bestValue, 220);
  assert.strictEqual(knapsack.totalWeight, 50);
  console.log('✅ 0-1 Knapsack MILP solver verified.');

  // 4. Test HiGHS WebAssembly Engine
  const wasmResult = await solveHiGHSModelWasm(`
Maximize
  10 x + 20 y
Subject To
  x + y <= 40
  x + 2 y <= 60
End
  `);
  assert.strictEqual(wasmResult.status, 'Optimal');
  assert.strictEqual(wasmResult.objectiveValue, 600);
  console.log('✅ HiGHS C++ WebAssembly solver verified.');

  console.log('\n🎉 ALL GUROBI & HIGHS OPTIMIZATION TESTS PASSED 100%!');
}

testGurobiEngine().catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
