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

const validRecord = { table: 'sales_events', field: 'amount', value: '49.99' };
const agentResult = node.processDataQualityAnomaly(validRecord);
ledger.logExecution(agentResult);

assert.strictEqual(agentResult.source, 'agentic');
assert.strictEqual(agentResult.result.status, 'REMEDIATED');
assert.strictEqual(agentResult.fallbackTriggered, false);

const invalidRecord = { table: 'sales_events', field: 'amount', value: null };
const fallbackResult = node.processDataQualityAnomaly(invalidRecord);
ledger.logExecution(fallbackResult);

assert.strictEqual(fallbackResult.source, 'deterministic_fallback');
assert.strictEqual(fallbackResult.result.status, 'ESCALATED');
assert.strictEqual(fallbackResult.fallbackTriggered, true);

const metrics = ledger.getMetrics();
assert.strictEqual(metrics.totalExecutions, 2);
assert.strictEqual(metrics.fallbackRate, 50);

console.log('✅ Databricks Quasi-Agentic Pipeline Engine Unit Tests PASSED!');
