'use strict';

const assert = require('assert');
const {
  PaxHybridStorage,
  GporcaQueryOptimizer,
  ApacheCloudberryMppEngine,
} = require('../tools/apache-cloudberry-mpp-engine');

console.log('=== Testing Apache Cloudberry MPP Analytics Engine ===');

const pax = new PaxHybridStorage();
pax.insertRecord({ agent: 'seed-yolo', latencyMs: 12 });
pax.insertRecord({ agent: 'hermes-yolo', latencyMs: 8 });

const latencies = pax.getColumnSlice('latencyMs');
assert.deepStrictEqual(latencies, [12, 8]);
console.log('  ✓ PAX Hybrid Storage returned columnar slice cleanly for telemetry queries.');

const opt = GporcaQueryOptimizer.optimizeQuery({ partitionKey: 'agent', aggregateField: 'latencyMs' });
assert.strictEqual(opt.partitionPruned, true);
assert.strictEqual(opt.aggregatePushedDown, true);
assert(opt.estimatedCost < 20, 'Expected aggregate push-down cost reduction');
console.log(`  ✓ GPORCA Query Optimizer achieved cost reduction (${opt.estimatedCost} vs baseline 95.0).`);

const mpp = new ApacheCloudberryMppEngine(4);
const tasks = [
  { name: 'verify_permissions' },
  { name: 'check_symlinks' },
  { name: 'audit_token_budget' },
  { name: 'hybrid_vector_rerank' },
];

const dispatchResult = mpp.dispatchParallelWorkload(tasks);
assert.strictEqual(dispatchResult.parallelExecution, true);
assert.strictEqual(dispatchResult.totalProcessed, 4);
assert.strictEqual(dispatchResult.segmentNodes.length, 4);
console.log('  ✓ Shared-Nothing MPP Engine distributed 4 workloads across 4 segment nodes cleanly.');

console.log('✅ Apache Cloudberry MPP Analytics Engine Unit Tests PASSED!');
