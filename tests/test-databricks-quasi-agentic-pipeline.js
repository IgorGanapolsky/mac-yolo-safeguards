'use strict';

const assert = require('assert');
const {
  DeterministicFallbackCircuitBreaker,
  QuasiAgenticPipelineNode,
  PipelineQualityLedger,
} = require('../tools/databricks-quasi-agentic-pipeline');

console.log('=== Testing Databricks Quasi-Agentic Pipeline Engine ===');

const ledger = new PipelineQualityLedger();
const node = new QuasiAgenticPipelineNode('dq_triage_node_1', 'schema_remediation');

// Test 1: Successful Agentic Execution
const validRecord = { table: 'sales_events', field: 'amount', value: '49.99' };
const agentResult = node.processDataQualityAnomaly(validRecord);
ledger.logExecution(agentResult);

assert.strictEqual(agentResult.source, 'agentic');
assert.strictEqual(agentResult.result.status, 'REMEDIATED');
assert.strictEqual(agentResult.fallbackTriggered, false);
console.log('  ✓ Agentic execution succeeded with strict JSON contract compliance.');

// Test 2: Circuit Breaker Triggered on Invalid Input
const invalidRecord = { table: 'sales_events', field: 'amount', value: null };
const fallbackResult = node.processDataQualityAnomaly(invalidRecord);
ledger.logExecution(fallbackResult);

assert.strictEqual(fallbackResult.source, 'deterministic_fallback');
assert.strictEqual(fallbackResult.result.status, 'ESCALATED');
assert.strictEqual(fallbackResult.fallbackTriggered, true);
console.log('  ✓ Circuit breaker fallback triggered cleanly on invalid record.');

// Test 3: Quality Ledger Metrics
const metrics = ledger.getMetrics();
assert.strictEqual(metrics.totalExecutions, 2);
assert.strictEqual(metrics.fallbackRate, 50);
console.log(`  ✓ Quality Ledger Metrics: total=${metrics.totalExecutions}, fallbackRate=${metrics.fallbackRate}%, avgLatency=${metrics.avgLatencyMs}ms`);

console.log('✅ Databricks Quasi-Agentic Pipeline Engine Unit Tests PASSED!');
