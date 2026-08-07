'use strict';

/**
 * Unit Tests for Databricks Genie Cost Optimizer (`tools/databricks-genie-cost-optimizer.js`)
 * Compatible with node tests/test-*.js harness (uses node:assert).
 */

const assert = require('assert');
const { executeAnalyticsQuery, auditAnalyticsPortfolio } = require('../tools/databricks-genie-cost-optimizer');

console.log('Running test-databricks-genie-cost-optimizer.js...');

// Test 1: Cached query execution (0 cost)
{
  const res = executeAnalyticsQuery('SELECT COUNT(*) FROM active_subscribers');
  assert.strictEqual(res.cacheHit, true, 'Expected cache hit');
  assert.strictEqual(res.dbuCost, 0.00, 'Expected $0.00 DBU cost for cached query');
  assert.strictEqual(res.computeTier, 'CACHE_LOOKUP_FREE', 'Expected CACHE_LOOKUP_FREE compute tier');
}

// Test 2: Fresh heavy query execution
{
  const res = executeAnalyticsQuery('SELECT * FROM large_table GROUP BY region', true);
  assert.strictEqual(res.cacheHit, false, 'Expected cache miss');
  assert.strictEqual(res.computeTier, 'HEAVY_WAREHOUSE_CLUSTER', 'Expected HEAVY_WAREHOUSE_CLUSTER tier');
}

// Test 3: Portfolio audit metrics
{
  const portfolio = auditAnalyticsPortfolio([
    'SELECT COUNT(*) FROM active_subscribers',
    'SELECT AVG(mrr) FROM paying_customers'
  ]);
  assert.strictEqual(portfolio.summary.cacheHitRatioPercent, 100, 'Expected 100% cache hit ratio');
  assert.strictEqual(portfolio.summary.status, 'OPTIMAL_GENIE_COST_EFFICIENCY', 'Expected OPTIMAL_GENIE_COST_EFFICIENCY status');
}

console.log('ok tests/test-databricks-genie-cost-optimizer.js');
