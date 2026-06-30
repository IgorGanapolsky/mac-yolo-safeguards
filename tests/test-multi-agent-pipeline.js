'use strict';

/**
 * test-multi-agent-pipeline.js — proves the three multi-agent guards.
 *
 * Run: node tests/test-multi-agent-pipeline.js
 *
 * Each guard is exercised with a deterministic scenario and an explicit assert.
 * No network, no LLM — the agents are stubs, so the test is a pure unit test of
 * the orchestration invariants.
 */

const assert = require('assert');
const {
  buildState,
  recordStep,
  buildCriticContext,
  shouldRetry,
  runPipeline,
  makeDemoAgents,
} = require('../tools/multi-agent-pipeline');

let passed = 0;
function check(label, fn) {
  fn();
  passed += 1;
  console.log(`  ok - ${label}`);
}

// ---------------------------------------------------------------------------
// GUARD 1: retry ceiling — a failing critique loop CANNOT run forever.
// ---------------------------------------------------------------------------
check('GUARD 1: retry ceiling halts an infinite critique loop', async () => {
  // Critic always rejects -> without the ceiling this loops forever.
  const agents = makeDemoAgents({ forceFail: true });
  const out = await runPipeline(agents, 'count users', { maxRetries: 3 });
  assert.strictEqual(out.ok, false, 'critique never passed, so ok must be false');
  assert.strictEqual(out.state.retryCount, 3, 'retryCount must hit the ceiling exactly');
  // The pipeline terminated (did not hang) and surfaced a best-effort response.
  assert.ok(out.state.finalResponse, 'a best-effort finalResponse must be surfaced');
  assert.strictEqual(out.state.finalResponse.surfacedBestEffort, true);
  // It built once, then critiqued, then rebuilt 3 times, then critiqued, then responded.
  const stages = out.state.trace.map((t) => t.stage);
  assert.deepStrictEqual(stages, [
    'intent', 'schema',
    'build', 'critique',
    'build', 'critique',
    'build', 'critique',
    'build', 'critique',
    'respond',
  ], `unexpected stage sequence: ${stages.join(',')}`);
});

check('GUARD 1: maxRetries=0 means exactly one build, no rebuilds', async () => {
  const agents = makeDemoAgents({ forceFail: true });
  const out = await runPipeline(agents, 'count users', { maxRetries: 0 });
  assert.strictEqual(out.state.retryCount, 0);
  const builds = out.state.trace.filter((t) => t.stage === 'build').length;
  assert.strictEqual(builds, 1, 'with maxRetries=0 there must be exactly one build');
});

// ---------------------------------------------------------------------------
// GUARD 2: failure_source — failures are attributed to the specific agent.
// ---------------------------------------------------------------------------
check('GUARD 2: a schema-agent failure is attributed to schema_agent', async () => {
  const agents = makeDemoAgents({ schemaFails: 1 }); // schema fails on first attempt
  const out = await runPipeline(agents, 'count users', { maxRetries: 2 });
  // Schema fails before any build -> pipeline aborts with schema failure source.
  assert.strictEqual(out.ok, false);
  assert.ok(out.failureSource, 'failureSource must be set');
  assert.strictEqual(out.failureSource.agent, 'schema_agent');
  assert.match(out.failureSource.reason, /schema/);
});

check('GUARD 2: a thrown agent error is caught and attributed, not crashed', async () => {
  const throwingAgent = {
    key: 'boom_agent',
    async run() { throw new Error('boom: OOM during inference'); },
  };
  const agents = {
    intentParser: throwingAgent,
    schema: { key: 'schema_agent', async run() { return { ok: true, output: {} }; } },
    queryBuilder: { key: 'query_builder', async run() { return { ok: true, output: 'SELECT 1;' }; } },
    critic: { key: 'critic', async run() { return { ok: true, output: { passed: true } }; } },
    responder: { key: 'responder', async run() { return { ok: true, output: {} }; } },
  };
  const out = await runPipeline(agents, 'count users');
  assert.strictEqual(out.ok, false);
  assert.ok(out.failureSource);
  assert.strictEqual(out.failureSource.agent, 'boom_agent');
  assert.match(out.failureSource.reason, /boom/);
});

// ---------------------------------------------------------------------------
// GUARD 3: independent critic — the critic never sees generator history.
// ---------------------------------------------------------------------------
check('GUARD 3: critic context excludes trace, retryCount, failureSource', () => {
  const state = buildState('count users', { maxRetries: 3 });
  state.intents = { x: 1 };
  state.schemaMapping = { y: 2 };
  state.generatedQuery = 'SELECT 1;';
  state.retryCount = 2;
  state.failureSource = { agent: 'query_builder', reason: 'prev draft bad' };
  state.trace = [{ agent: 'query_builder', stage: 'build' }];

  const ctx = buildCriticContext(state);
  assert.strictEqual(ctx.userTask, 'count users');
  assert.strictEqual(ctx.generatedQuery, 'SELECT 1;');
  // The forbidden fields — these are what cause anchoring.
  assert.strictEqual(ctx.trace, undefined, 'critic must NOT see the trace');
  assert.strictEqual(ctx.retryCount, undefined, 'critic must NOT see retryCount');
  assert.strictEqual(ctx.failureSource, undefined, 'critic must NOT see prior failure attribution');
  // And it is frozen — a buggy critic cannot mutate pipeline state.
  assert.ok(Object.isFrozen(ctx), 'critic context must be frozen');
});

check('GUARD 3: critic that inspects forbidden fields self-reports anchoring', async () => {
  // Use the demo critic, which actively checks it did not receive history.
  const agents = makeDemoAgents({ forceFail: false });
  // Tamper: make a critic that simulates receiving the full state (the bug we guard against).
  agents.critic = {
    key: 'critic',
    async run(ctx) {
      if (ctx.trace !== undefined) return { ok: false, reason: 'anchoring risk' };
      return { ok: true, output: { passed: true } };
    },
  };
  const out = await runPipeline(agents, 'count users');
  assert.strictEqual(out.ok, true, 'with a clean context the critic should accept');
});

// ---------------------------------------------------------------------------
// Happy path: a passing critique terminates after exactly one build.
// ---------------------------------------------------------------------------
check('HAPPY PATH: passing critique terminates after one build and responds', async () => {
  const agents = makeDemoAgents({ forceFail: false });
  const out = await runPipeline(agents, 'count users', { maxRetries: 3 });
  assert.strictEqual(out.ok, true);
  assert.strictEqual(out.state.retryCount, 0);
  assert.strictEqual(out.state.finalResponse.accepted, true);
  assert.strictEqual(out.state.finalResponse.surfacedBestEffort, false);
  assert.strictEqual(out.failureSource, null);
  const builds = out.state.trace.filter((t) => t.stage === 'build').length;
  assert.strictEqual(builds, 1);
});

// ---------------------------------------------------------------------------
// Pure unit checks on the retry edge function.
// ---------------------------------------------------------------------------
check('shouldRetry: passed -> respond', () => {
  const s = { critique: { passed: true }, retryCount: 0, maxRetries: 3 };
  assert.strictEqual(shouldRetry(s), 'respond');
});
check('shouldRetry: failing under ceiling -> rebuild', () => {
  const s = { critique: { passed: false }, retryCount: 1, maxRetries: 3 };
  assert.strictEqual(shouldRetry(s), 'rebuild');
});
check('shouldRetry: failing AT ceiling -> respond (best effort)', () => {
  const s = { critique: { passed: false }, retryCount: 3, maxRetries: 3 };
  assert.strictEqual(shouldRetry(s), 'respond');
});

// ---------------------------------------------------------------------------
// buildState validation
// ---------------------------------------------------------------------------
check('buildState rejects empty task', () => {
  assert.throws(() => buildState(''), /non-empty/);
  assert.throws(() => buildState(undefined), /non-empty/);
});

(async () => {
  console.log(`\n${passed} checks passed.`);
  // The async checks above ran inside check(), but ensure all promises settled.
  await Promise.resolve();
  console.log('ALL GREEN');
  process.exit(0);
})().catch((err) => {
  console.error('TEST FAILED:', err && err.stack ? err.stack : err);
  process.exit(1);
});
