'use strict';

const assert = require('assert');
const {
  runGurobiOptimizationSuite,
  presolveLinearModel,
  solveKnapsackMILP,
  solveAgentSwarmAssignment,
  diagnoseInfeasibleConstraints,
  solveLLMTokenRouting
} = require('../tools/gurobi-optimization-engine');

console.log('Testing Gurobi Optimization Engine...');

// Test 1: Presolve Engine
const model = {
  variables: {
    v1: { lb: 0, ub: 1 },
    v2: { lb: 2, ub: 2 }, // Fixed
    v3: { lb: 0, ub: 1 }
  },
  constraints: [
    { terms: { v1: 0.1 }, sense: '<=', rhs: 10 }, // Redundant
    { terms: { v1: 1, v3: 1 }, sense: '<=', rhs: 1 } // Active
  ]
};
const presolveRes = presolveLinearModel(model);
assert.strictEqual(presolveRes.fixedVariables, 1, 'Presolve should identify 1 fixed variable');
assert.strictEqual(presolveRes.removedConstraints, 1, 'Presolve should remove 1 redundant constraint');
console.log('✔ Presolve Engine test passed.');

// Test 2: 0-1 MILP / Knapsack Solver
const items = [
  { id: 'item1', value: 60, weight: 10 },
  { id: 'item2', value: 100, weight: 20 },
  { id: 'item3', value: 120, weight: 30 }
];
const knapsackRes = solveKnapsackMILP(items, 50);
assert.strictEqual(knapsackRes.bestValue, 220, 'Optimal knapsack value should be 220');
assert.strictEqual(knapsackRes.totalWeight, 50, 'Total weight should equal capacity 50');
console.log('✔ 0-1 MILP Knapsack Solver test passed.');

// Test 3: Multi-Agent Swarm Assignment
const tasks = [
  { id: 'T1', priority: 5, estimatedValue: 100, memoryMb: 200, fileLocks: ['fileA.js'] },
  { id: 'T2', priority: 4, estimatedValue: 80, memoryMb: 300, fileLocks: ['fileA.js'] }, // Lock collision
  { id: 'T3', priority: 3, estimatedValue: 60, memoryMb: 100, fileLocks: ['fileB.js'] }
];
const workers = ['agent-1', 'agent-2'];
const swarmRes = solveAgentSwarmAssignment(tasks, workers, 600);
assert.strictEqual(swarmRes.lockCollisionsPrevented, 1, 'Should prevent 1 lock collision');
assert.strictEqual(swarmRes.scheduledTasksCount, 2, 'Should schedule 2 non-conflicting tasks');
console.log('✔ Multi-Agent Swarm Allocation test passed.');

// Test 4: Feasibility & IIS Diagnostic Engine
const feasibleState = { ramUsagePercent: 60, cpuLoad: 2.0, activeSimulators: 1 };
const infeasibleState = { ramUsagePercent: 95, cpuLoad: 9.5, activeSimulators: 3 };
const thresholds = { maxRamPercent: 85, maxCpuLoad: 8.0, maxSimulators: 2 };

const diagFeasible = diagnoseInfeasibleConstraints(feasibleState, thresholds);
assert.strictEqual(diagFeasible.isFeasible, true, 'State should be feasible');

const diagInfeasible = diagnoseInfeasibleConstraints(infeasibleState, thresholds);
assert.strictEqual(diagInfeasible.isFeasible, false, 'State should be infeasible');
assert.strictEqual(diagInfeasible.violationsCount, 3, 'Should identify 3 IIS constraint violations');
console.log('✔ Feasibility & IIS Diagnostic test passed.');

// Test 5: Economic Token Routing MILP
const reqs = [
  { id: 'R1', estimatedTokens: 1000 },
  { id: 'R2', estimatedTokens: 2000 }
];
const tokenRes = solveLLMTokenRouting(reqs, 0.05);
assert.strictEqual(tokenRes.totalRequests, 2, 'Should process 2 requests');
assert.strictEqual(tokenRes.status, 'OPTIMAL', 'Token routing status should be OPTIMAL');
console.log('✔ Economic Token Routing test passed.');

// Test 6: Full Suite Integration
const fullSuite = runGurobiOptimizationSuite();
assert.strictEqual(fullSuite.overallScore, '10/10 (A+ OPTIMAL)');
console.log('✔ Full Optimization Suite integration test passed.');

console.log('\nAll Gurobi Optimization Engine tests PASSED (100% success).');
