#!/usr/bin/env node
'use strict';

/**
 * tests/test-dual-model-moa-router.js
 *
 * Unit tests verifying Dual-Model Mixture-of-Agents (MoA) invariants:
 * - Model tiers (Strategist Gemini, Tactical Claude, Local Fast Proposer)
 * - Zero-pre-inference task complexity scoring (RouteMoA)
 * - Split workflow handoff and cross-session coherence trace
 * - Cross-provider parity routing and failover (never intra-provider)
 * - Rigid structural schema validation
 * - Hop-count capping guardrail (max 3 hops to prevent runaway loops)
 */

const assert = require('assert');
const {
  MODEL_TIERS,
  scoreTaskComplexity,
  buildStrategistHandoff,
  buildCrossSessionSyncTrace,
  resolveProviderFallback,
  validateStructuralSchema,
  guardExecutionHopCount,
} = require('../tools/dual-model-moa-router');

let passed = 0;
let total = 0;

function it(name, fn) {
  total += 1;
  try {
    fn();
    passed += 1;
  } catch (err) {
    console.error(`FAIL: ${name}`);
    console.error(err);
    process.exit(1);
  }
}

// 1. Model Tier Matrix
it('exposes Strategist (Gemini), Tactical (Claude), and Local Proposer (Laguna XS)', () => {
  assert(MODEL_TIERS.strategist_ingester);
  assert(MODEL_TIERS.tactical_executor);
  assert(MODEL_TIERS.local_fast_proposer);

  assert.strictEqual(MODEL_TIERS.strategist_ingester.provider, 'google');
  assert.strictEqual(MODEL_TIERS.tactical_executor.provider, 'anthropic');
  assert.strictEqual(MODEL_TIERS.local_fast_proposer.provider, 'local');

  assert(MODEL_TIERS.strategist_ingester.contextWindow >= 1000000);
  assert(MODEL_TIERS.tactical_executor.contextWindow >= 200000);
});

// 2. RouteMoA Complexity Scoring
it('scores lightweight tasks for LOCAL_ONLY with 100% cost reduction', () => {
  const result = scoreTaskComplexity('quick status check of current health');
  assert.strictEqual(result.strategy, 'LOCAL_ONLY');
  assert(result.score <= 0.25);
  assert.strictEqual(result.allocation.strategist, null);
  assert.strictEqual(result.allocation.tacticalExecutor, null);
  assert.strictEqual(result.estimatedSavings.costReductionPct, 100);
});

it('routes code edits and tests to TACTICAL_ONLY', () => {
  const result = scoreTaskComplexity('refactor tools/mac-yolo-disk-guard.js and run unit tests');
  assert.strictEqual(result.strategy, 'TACTICAL_ONLY');
  assert.strictEqual(result.allocation.strategist, null);
  assert.strictEqual(result.allocation.tacticalExecutor, 'claude-3-7-sonnet');
});

it('routes multimodal / global architecture tasks to SPLIT_WORKFLOW_DUAL_MOA', () => {
  const result = scoreTaskComplexity('telemetry graphrag multimodal analysis to refactor Swift HUD and terminal agent');
  assert.strictEqual(result.strategy, 'SPLIT_WORKFLOW_DUAL_MOA');
  assert.strictEqual(result.allocation.strategist, 'gemini-4-argon');
  assert.strictEqual(result.allocation.tacticalExecutor, 'claude-3-7-sonnet');
});

// 3. Split Workflow Handshake
it('builds a structured strategist handoff contract', () => {
  const handoff = buildStrategistHandoff('Diagnose 100% CPU runaway', {
    cpuLoad: 'high',
    graphNodesCount: 142,
  });
  assert.strictEqual(handoff.role, 'StrategistHandoff');
  assert.strictEqual(handoff.handoffContract.executor, 'claude-3-7-sonnet');
  assert.strictEqual(handoff.handoffContract.maxExecutionHops, 3);
  assert.strictEqual(handoff.telemetry.graphContextNodes, 142);
});

it('builds cross-session sync trace feeding tactical outputs into strategist buffer', () => {
  const trace = buildCrossSessionSyncTrace({
    commands: ['npm test', 'node tools/agentic-graphrag-safeguard.js'],
    filesModified: ['tools/mac-yolo-system-care-engine.js'],
    testOutcomes: { passed: true, total: 5 },
    summary: 'Cool down fans verified.',
  });
  assert.strictEqual(trace.type, 'CrossSessionSyncTrace');
  assert.strictEqual(trace.strategistBufferUpdate.status, 'RESOLVED');
  assert.strictEqual(trace.filesModified[0], 'tools/mac-yolo-system-care-engine.js');
});

// 4. Cross-Provider Parity Routing
it('fails over cross-provider (Claude -> Gemini, Gemini -> Claude)', () => {
  const claudeFail = resolveProviderFallback('anthropic');
  assert.strictEqual(claudeFail.fallbackProvider, 'google');
  assert.strictEqual(claudeFail.modelId, 'gemini-4-argon');

  const geminiFail = resolveProviderFallback('google');
  assert.strictEqual(geminiFail.fallbackProvider, 'anthropic');
  assert.strictEqual(geminiFail.modelId, 'claude-3-7-sonnet');
});

// 5. Rigid Structural Schema Validation
it('validates schema requirements and triggers fallback on missing keys', () => {
  const valid = validateStructuralSchema({ task: 'foo', plan: 'bar' }, ['task', 'plan']);
  assert.strictEqual(valid.valid, true);
  assert.strictEqual(valid.triggerFallback, false);

  const invalid = validateStructuralSchema({ task: 'foo' }, ['task', 'plan', 'evidence']);
  assert.strictEqual(invalid.valid, false);
  assert.strictEqual(invalid.triggerFallback, true);
  assert(invalid.missingKeys.includes('plan'));
  assert(invalid.missingKeys.includes('evidence'));
});

// 6. Hop Capping Guardrail
it('enforces max 3 hops to prevent runaway loops', () => {
  const hop1 = guardExecutionHopCount(0, 3);
  assert.strictEqual(hop1.allowed, true);
  assert.strictEqual(hop1.hop, 1);
  assert.strictEqual(hop1.remainingHops, 2);

  const hop2 = guardExecutionHopCount(1, 3);
  assert.strictEqual(hop2.allowed, true);
  assert.strictEqual(hop2.hop, 2);

  const hop3 = guardExecutionHopCount(2, 3);
  assert.strictEqual(hop3.allowed, true);
  assert.strictEqual(hop3.hop, 3);

  const hop4 = guardExecutionHopCount(3, 3);
  assert.strictEqual(hop4.allowed, false);
  assert.strictEqual(hop4.action, 'HALT_EXECUTION_LOOP');
});

console.log(`test-dual-model-moa-router: PASS (${passed}/${total} tests passed)`);
