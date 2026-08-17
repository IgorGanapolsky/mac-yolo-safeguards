/**
 * tests/test-dimagent-runtime-engine.js
 *
 * Test suite for DimAgent high-ROI features:
 * 1. KV Prefix Optimizer & Cache Hit Calculation (>=90%)
 * 2. Blob Offload Engine (output replacement & disk caching)
 * 3. 3-Layer Error Recovery (Transient retry, context compaction, state rollback)
 * 4. Two-Layer Plan Mode Gate (Hard interdiction)
 * 5. Agent Client Protocol (ACP) JSON-RPC Server & Replay
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const {
  CacheNativePrefixOptimizer,
  BlobOffloadEngine,
  ThreeLayerResilienceRuntime,
  TwoLayerPlanModeGate,
  AgentClientProtocolServer,
} = require('../tools/dimagent-runtime-engine');

async function runTests() {
  console.log('--- Running DimAgent Runtime Engine Verification Suite ---');

  // Test 1: Cache-Native Prefix Optimizer
  console.log('1. Testing KV-Cache Prefix Optimizer...');
  const optimizer = new CacheNativePrefixOptimizer({
    systemPrompt: 'System Core Protocol v1.0',
    tools: [
      { name: 'read_file', description: 'Read file contents', parameters: { type: 'object' } },
      { name: 'write_file', description: 'Write file contents', parameters: { type: 'object' } },
    ],
  });
  const prefix = optimizer.buildCacheAlignedPrefix('Task instructions');
  assert(prefix.prefixHash, 'Prefix hash must be computed');
  assert(prefix.toolDefinitionsBlock.includes('read_file'), 'Tool definitions must be preserved');
  const hitRate = optimizer.calculateCacheHitRate(3920, 4000);
  assert(hitRate >= 95, `Cache hit rate must exceed 90% (got ${hitRate}%)`);
  console.log(`✓ KV-Cache Prefix Optimizer: hash=${prefix.prefixHash.slice(0, 8)}, hitRate=${hitRate}%`);

  // Test 2: Blob Offload Engine
  console.log('2. Testing Blob Offload Engine...');
  const testBlobDir = path.resolve(__dirname, '..', '.cache', 'test_blobs');
  const blobEngine = new BlobOffloadEngine(testBlobDir);
  const smallOutput = 'Short terminal output';
  const smallResult = blobEngine.processOutput(smallOutput);
  assert.strictEqual(smallResult.isOffloaded, false, 'Small output should stay inline');

  const largeOutput = 'X'.repeat(5000);
  const largeResult = blobEngine.processOutput(largeOutput);
  assert.strictEqual(largeResult.isOffloaded, true, 'Large output must be offloaded to blob storage');
  assert(largeResult.content.includes('DIMAGENT_BLOB_OFFLOAD'), 'Compact pointer must be returned');
  const retrieved = blobEngine.retrieveBlob(largeResult.sha256);
  assert.strictEqual(retrieved, largeOutput, 'Retrieved blob must match original output');
  console.log(`✓ Blob Offload Engine: offloaded 5000B -> pointer="${largeResult.content.slice(0, 45)}..."`);

  // Test 3: 3-Layer Error Recovery Runtime
  console.log('3. Testing 3-Layer Resilience Runtime...');
  const runtime = new ThreeLayerResilienceRuntime({ maxRetries: 3 });

  // Layer 1: Transient retry
  let attemptCount = 0;
  const retryResult = await runtime.executeWithTransientRetry(async (attempt) => {
    attemptCount++;
    if (attempt < 2) {
      throw new Error('Rate_limit exceeded 429');
    }
    return 'SUCCESS';
  });
  assert.strictEqual(retryResult, 'SUCCESS', 'Must succeed on retry');
  assert.strictEqual(attemptCount, 2, 'Must have attempted twice');

  // Layer 2: Context compaction
  const largeHistory = [
    { role: 'system', content: 'System instruction' },
    { role: 'system', content: 'Tools instruction' },
    ...Array.from({ length: 40 }, (_, i) => ({ role: 'user', content: `Turn ${i} with long context: ` + 'A'.repeat(500) })),
    { role: 'assistant', content: 'Final recent response' },
  ];
  const compacted = runtime.compactContextHistory(largeHistory, 1000);
  assert(compacted.length < largeHistory.length, 'Compacted history must be smaller');
  assert(compacted[2].content.includes('DIMAGENT_COMPACTION'), 'Compaction indicator must be inserted');

  // Layer 3: Checkpoint & Rollback
  runtime.createCheckpoint('step_1', { progress: 50 });
  runtime.createCheckpoint('step_2', { progress: 80 });
  const lastCheckpoint = runtime.rollbackToLastCheckpoint();
  assert.strictEqual(lastCheckpoint.stateId, 'step_2', 'Rollback must retrieve last checkpoint');
  console.log('✓ 3-Layer Resilience Runtime: Layer 1 (Retry), Layer 2 (Compaction), Layer 3 (Rollback) verified');

  // Test 4: Two-Layer Plan Mode Gate
  console.log('4. Testing Two-Layer Plan Mode Gate...');
  const planGate = new TwoLayerPlanModeGate('plan');
  const readEval = planGate.evaluateToolCall('read_file', { path: 'file.txt' });
  assert.strictEqual(readEval.allowed, true, 'Read tool must be allowed in plan mode');
  const writeEval = planGate.evaluateToolCall('run_command', { CommandLine: 'rm -rf /' });
  assert.strictEqual(writeEval.allowed, false, 'Mutating tool must be blocked in plan mode');
  assert(writeEval.reason.includes('PLAN_MODE_ACTIVE'), 'Rejection reason must be stated');
  console.log('✓ Two-Layer Plan Mode Gate: read allowed, write blocked');

  // Test 5: Agent Client Protocol (ACP) Server
  console.log('5. Testing ACP JSON-RPC 2.0 Server...');
  const testTraceDir = path.resolve(__dirname, '..', '.cache', 'test_traces');
  const acpServer = new AgentClientProtocolServer({ planGate, traceDir: testTraceDir });

  // Initialize
  const initRes = acpServer.handleRpcRequest({ jsonrpc: '2.0', id: 1, method: 'initialize' });
  assert.strictEqual(initRes.result.server, 'DimAgent-Hermes-ACP');

  // Create session
  const createRes = acpServer.handleRpcRequest({ jsonrpc: '2.0', id: 2, method: 'session/create', params: { mode: 'plan' } });
  const sessionId = createRes.result.sessionId;
  assert(sessionId, 'Session ID must be created');

  // Step with blocked tool in plan mode
  const blockedStepRes = acpServer.handleRpcRequest({
    jsonrpc: '2.0',
    id: 3,
    method: 'session/step',
    params: { sessionId, toolCall: { name: 'write_to_file', arguments: { TargetFile: 'foo.js' } } },
  });
  assert.strictEqual(blockedStepRes.result.status, 'blocked');

  // Step with allowed tool
  const allowedStepRes = acpServer.handleRpcRequest({
    jsonrpc: '2.0',
    id: 4,
    method: 'session/step',
    params: { sessionId, toolCall: { name: 'read_file', arguments: { path: 'foo.js' } } },
  });
  assert.strictEqual(allowedStepRes.result.status, 'executed');

  // Replay
  const replayRes = acpServer.handleRpcRequest({ jsonrpc: '2.0', id: 5, method: 'session/replay', params: { sessionId } });
  assert.strictEqual(replayRes.result.steps.length, 1, 'Replay must return executed steps');
  console.log('✓ ACP JSON-RPC 2.0 Server & Replay: Full lifecycle verified');

  // Cleanup test artifacts
  try {
    fs.rmSync(testBlobDir, { recursive: true, force: true });
    fs.rmSync(testTraceDir, { recursive: true, force: true });
  } catch {}

  console.log('\n=== ALL DIMAGENT RUNTIME ENGINE TESTS PASSED (100% GREEN) ===');
}

runTests().catch((err) => {
  console.error('Test suite failed:', err);
  process.exit(1);
});
