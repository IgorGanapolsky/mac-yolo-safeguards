'use strict';

const assert = require('assert');
const { DatabricksGenieCostOptimizer } = require('../tools/databricks-genie-cost-optimizer');

console.log('=== Testing Databricks Genie Code Cost & Context Optimizer ===');

const optimizer = new DatabricksGenieCostOptimizer();

// 1. Test context optimization under cost cap
const efficientResult = optimizer.optimizeTaskContext({ tokenCount: 50_000 });
assert.strictEqual(efficientResult.isCostCompliant, true);
assert.strictEqual(efficientResult.recommendedStrategy, 'full_context');

// 2. Test context pruning when exceeding $0.55 cost cap
const heavyResult = optimizer.optimizeTaskContext({ tokenCount: 300_000 });
assert.strictEqual(heavyResult.isCostCompliant, false);
assert.strictEqual(heavyResult.recommendedStrategy, 'semantic_pruned_context');

// 3. Test execution profile generation
const profile = optimizer.generateExecutionProfile('test-query');
assert.strictEqual(profile.benchmarkParity.databricksBenchmarkParity, true);
assert.strictEqual(profile.harnessDirectives.length, 4);

console.log('✅ Databricks Genie Cost & Context Optimizer Tests PASSED!');
