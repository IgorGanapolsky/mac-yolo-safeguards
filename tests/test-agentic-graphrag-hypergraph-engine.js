#!/usr/bin/env node
'use strict';

/**
 * tests/test-agentic-graphrag-hypergraph-engine.js
 *
 * Behavioral and invariant test suite for the 3-Pillar
 * Dual-Model Mixture-of-Agents & Agentic GraphRAG Playbook engine:
 *   1. Pillar 1: Dual-Model Operational Matrix, Split Workflow Handoff Packet,
 *      Sync Prompt generation, and Volodymyr Pavlyshyn's Loop Memory Model lifecycle graph.
 *   2. Pillar 2: Schema-Constrained Ontology (Pattern B), Graph-R1 Hypergraphs (Pattern C)
 *      with Format + F1 reward scoring, step-by-step `rethink` traversal, Cypher translation,
 *      and explicitly cited context blocks.
 *   3. Pillar 3: Cross-Provider Parity Routing (blocking same-provider regional failover),
 *      Rigid Structural Schema Validation (treating malformed JSON / missing fields as
 *      LOGICAL_TIMEOUT), and Token-Throttling Guardrails (MAX_FALLBACK_HOPS = 3 + $10/mo cap).
 */

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  MAX_FALLBACK_HOPS,
  TOKEN_BUDGET_CAP_USD,
  OPERATIONAL_MODEL_MATRIX,
  EXTRACTION_PATTERNS,
  GATEWAY_PROFILES,
  classifyWorkloadRole,
  buildSplitWorkflowHandoff,
  recordLoopMemoryState,
  runIngestionTier,
  computeGraphR1Rewards,
  runAgenticSearchTier,
  verifyCrossProviderParityChain,
  validateGatewayResponseSchema,
  executeGovernedGatewayCall,
  runSelfTest,
} = require('../tools/agentic-graphrag-hypergraph-engine');

function testPillar1DualModelSplitWorkflowAndLoopMemory() {
  // Operational Model Matrix invariants
  assert.strictEqual(OPERATIONAL_MODEL_MATRIX.strategist.contextProfile.sharedTokenBudget, 1000000);
  assert.strictEqual(OPERATIONAL_MODEL_MATRIX.executor.contextProfile.highDensityTokens, 200000);

  // Split workflow role classification
  const dual = classifyWorkloadRole('Global architecture review of wireframe + atomic git edit and unit test fix');
  assert.strictEqual(dual.mode, 'SPLIT_WORKFLOW_DUAL_MODEL');
  assert.strictEqual(dual.primaryStrategist, 'gemini-4-argon');
  assert.strictEqual(dual.primaryExecutor, 'claude-opus-4.7');

  const stratOnly = classifyWorkloadRole('Global review of multimodal wireframe across 1M context');
  assert.strictEqual(stratOnly.mode, 'STRATEGIST_PRIMARY');

  const execOnly = classifyWorkloadRole('Run unit test and commit atomic lint fix');
  assert.strictEqual(execOnly.mode, 'EXECUTOR_PRIMARY');

  // Handoff packet & sync prompt
  const handoff = buildSplitWorkflowHandoff({
    title: 'Implement Agentic GraphRAG Hypergraph Engine',
    targetFiles: ['tools/agentic-graphrag-hypergraph-engine.js'],
    invariants: ['Enforce Pattern B ontology', 'Cap fallback hops at 3'],
    graphCitations: ['[cite:Guardrail:CrossProviderParityAndSchemaGate]'],
    verificationCommand: 'node tests/test-agentic-graphrag-hypergraph-engine.js',
  });
  assert.ok(handoff.handoffId.startsWith('handoff-'));
  assert.ok(handoff.markdownHandoff.includes('1M shared token buffer'));
  assert.ok(handoff.markdownHandoff.includes('200k high-density window'));
  assert.ok(handoff.syncPromptTemplate.includes('[SPLIT-WORKFLOW SYNC -> STRATEGIST 1M BUFFER]'));

  // Loop Memory Model persistence
  const tmpFile = path.join(os.tmpdir(), `loop-memory-test-${Date.now()}.json`);
  try {
    const loopRes = recordLoopMemoryState(
      {
        runId: 'test-run-1',
        handoffId: handoff.handoffId,
        commitSha: 'b61adef7',
        exitCode: 0,
        filesTouched: ['tools/agentic-graphrag-hypergraph-engine.js'],
        summary: 'All 3 pillars verified green',
      },
      tmpFile
    );
    assert.strictEqual(loopRes.ok, true);
    assert.strictEqual(loopRes.runNode.status, 'VERIFIED');
    assert.ok(loopRes.totalLifecycleNodes >= 3);
    assert.ok(loopRes.totalLifecycleEdges >= 2);
  } finally {
    try {
      fs.unlinkSync(tmpFile);
    } catch {
      /* ignore */
    }
  }
}

function testPillar2SchemaConstrainedHypergraphAndRethink() {
  // Pattern B schema enforcement rejects unknown entity types
  assert.throws(() => {
    runIngestionTier({
      customNodes: [{ id: 'Bad:1', type: 'UnconstrainedHallucinatedType', label: 'bad' }],
    });
  }, /Schema-Constrained Extraction violation/);

  const graph = runIngestionTier();
  assert.strictEqual(graph.schemaPattern, EXTRACTION_PATTERNS.PATTERN_B_SCHEMA_CONSTRAINED.id);
  assert.strictEqual(graph.hypergraphPattern, EXTRACTION_PATTERNS.PATTERN_C_GRAPH_R1_HYPERGRAPH.id);
  assert.ok(graph.nodes.length >= 10);
  assert.ok(graph.hyperedges.length >= 3);

  // Search tier with Rethink expansion
  const search = runAgenticSearchTier('prevent BTM background notification and duplicate HUD windows', {
    graph,
    maxDepth: 2,
    rethinkThreshold: 0.9, // ensure rethink step executes and expands hyperedge neighborhood
  });
  assert.strictEqual(search.rethinkTriggered, true);
  assert.strictEqual(search.traversalSteps.length, 2);
  assert.strictEqual(search.traversalSteps[1].state, 'RETHINK_HYPERGRAPH_EXPANSION');
  assert.ok(search.cypherQuery.startsWith('MATCH (n)-[r*1..2]-(m)'));
  assert.ok(search.citedContextBlock.includes('[cite:Hyperedge:HE-BTM-SINGLE-INSTANCE-CLOSURE]'));
  assert.strictEqual(search.rewards.formatReward, 1.0);
  assert.ok(search.rewards.f1Reward > 0);
}

function testPillar3GovernedGatewayParitySchemaAndHopCap() {
  assert.strictEqual(MAX_FALLBACK_HOPS, 3);
  assert.strictEqual(TOKEN_BUDGET_CAP_USD, 10.0);
  assert.ok(GATEWAY_PROFILES.bifrost && GATEWAY_PROFILES.litellm && GATEWAY_PROFILES.portkey);

  // 1. Cross-Provider Parity Routing blocks same-provider regional failover
  const badChain = [
    { hop: 1, provider: 'anthropic', model: 'claude-opus-4.7', region: 'us-east-1' },
    { hop: 2, provider: 'anthropic', model: 'claude-3.5-sonnet', region: 'us-west-2' },
  ];
  const parityCheck = verifyCrossProviderParityChain(badChain);
  assert.strictEqual(parityCheck.ok, false);
  assert.strictEqual(parityCheck.violations.length, 1);

  const blockedRes = executeGovernedGatewayCall({ chain: badChain });
  assert.strictEqual(blockedRes.ok, false);
  assert.strictEqual(blockedRes.abortedByGuardrail, 'CROSS_PROVIDER_PARITY_VIOLATION');

  // 2. Rigid Structural Schema Validation treats invalid JSON or missing fields as LOGICAL_TIMEOUT
  const badJsonCheck = validateGatewayResponseSchema('{not valid json', { requiredFields: ['status'] });
  assert.strictEqual(badJsonCheck.valid, false);
  assert.strictEqual(badJsonCheck.failureType, 'LOGICAL_TIMEOUT');

  const missingFieldCheck = validateGatewayResponseSchema(
    { status: 'ok' },
    { requiredFields: ['status', 'decision'] }
  );
  assert.strictEqual(missingFieldCheck.valid, false);
  assert.strictEqual(missingFieldCheck.failureType, 'LOGICAL_TIMEOUT');

  // 3. Failover from Hop 1 (LOGICAL_TIMEOUT) -> Hop 2 (Provider Outage) -> Hop 3 (Local MLX $0 Success)
  const hop3Success = executeGovernedGatewayCall({
    gateway: 'bifrost',
    schema: { requiredFields: ['status', 'decision'] },
    simulatedResponses: {
      anthropic: '{malformed', // Hop 1 -> LOGICAL_TIMEOUT
      google: { error: '503 Service Unavailable' }, // Hop 2 -> PROVIDER_OUTAGE_OR_TIMEOUT
      local_mlx: { status: 'ok', decision: 'Resolved locally on Apple Silicon MLX at $0 cost' }, // Hop 3 -> SUCCESS
    },
  });
  assert.strictEqual(hop3Success.ok, true);
  assert.strictEqual(hop3Success.resolvedAtHop, 3);
  assert.strictEqual(hop3Success.selectedProvider, 'local_mlx');
  assert.strictEqual(hop3Success.attempts[0].outcome, 'LOGICAL_TIMEOUT');
  assert.strictEqual(hop3Success.attempts[1].outcome, 'PROVIDER_OUTAGE_OR_TIMEOUT');
  assert.strictEqual(hop3Success.attempts[2].outcome, 'SUCCESS');

  // 4. Token-Throttling Guardrail blocks hop > 3 and enforces $10/mo cap
  const budgetCapped = executeGovernedGatewayCall({
    currentMonthSpendUsd: 9.995, // Paid hops ($0.015 and $0.008) exceed $10.00 cap -> skips directly to Hop 3 ($0 local_mlx)
    schema: { requiredFields: ['status', 'decision'] },
  });
  assert.strictEqual(budgetCapped.ok, true);
  assert.strictEqual(budgetCapped.resolvedAtHop, 3);
  assert.strictEqual(budgetCapped.selectedProvider, 'local_mlx');
  assert.strictEqual(budgetCapped.totalCostUsd, 0);
  assert.strictEqual(budgetCapped.attempts[0].outcome, 'SKIPPED_TOKEN_BUDGET_CAP');
  assert.strictEqual(budgetCapped.attempts[1].outcome, 'SKIPPED_TOKEN_BUDGET_CAP');
}

function main() {
  testPillar1DualModelSplitWorkflowAndLoopMemory();
  testPillar2SchemaConstrainedHypergraphAndRethink();
  testPillar3GovernedGatewayParitySchemaAndHopCap();

  const selfTest = runSelfTest();
  assert.strictEqual(selfTest.ok, true);

  console.log('test-agentic-graphrag-hypergraph-engine: PASS (all 3 Playbook pillars & guardrails verified)');
}

main();
