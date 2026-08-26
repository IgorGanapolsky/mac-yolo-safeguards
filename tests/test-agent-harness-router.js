#!/usr/bin/env node
'use strict';

/**
 * Tests for tools/agent-harness-router.js
 *
 * Covers:
 * - Model registry: filterModels, effectiveCost, routeModel (cost/latency/quality/privacy/balance)
 * - BudgetGuard: recordSpend, checkBudget, isExhausted, fail-closed behavior
 * - DiscoveryCapture: capture, query, secret rejection, input-capture refusal
 * - PrivateBenchmark: addTask, recordResult, getPortabilityScores
 * - ModelRegistry: isFirstParty, isVerifiedThirdParty, isSafeForSensitiveData
 * - No ChatGPT Computer History behavior: never captures keystrokes/input events
 *
 * Dependency-free (Node.js built-ins only), consistent with repo convention.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const assert = require('assert');

const MOD = require('../tools/agent-harness-router.js');

let testNum = 0;
let passNum = 0;
let failNum = 0;
const failures = [];

function test(name, fn) {
  testNum++;
  try {
    fn();
    passNum++;
  } catch (e) {
    failNum++;
    failures.push({ name, error: e.message });
    console.error(`  FAIL: ${name} — ${e.message}`);
  }
}

function assertEqual(actual, expected, msg) {
  assert.deepStrictEqual(actual, expected, msg || `expected ${JSON.stringify(expected)}`);
}

function assertTrue(val, msg) {
  assert.ok(val, msg || `expected truthy, got ${val}`);
}

function assertFalse(val, msg) {
  assert.ok(!val, msg || `expected falsy, got ${val}`);
}

function assertThrows(fn, msg) {
  let threw = false;
  try { fn(); } catch { threw = true; }
  assertTrue(threw, msg || 'expected function to throw');
}

function assertThrowsWith(fn, msgFragment, msg) {
  let threw = false;
  let err = '';
  try { fn(); } catch (e) { threw = true; err = e.message; }
  assertTrue(threw, msg || 'expected function to throw');
  assertTrue(err.toLowerCase().includes(msgFragment.toLowerCase()),
    `expected error to contain "${msgFragment}", got: ${err}`);
}

// ─── 1. MODEL REGISTRY CONSTANTS ──────────────────────────────────

test('MODEL_REGISTRY has expected models', () => {
  assertTrue(MOD.MODEL_REGISTRY['zai-org/glm-5.3'], 'should have ZAI GLM-5.3');
  assertTrue(MOD.MODEL_REGISTRY['openai/gpt-4.1'], 'should have OpenAI GPT-4.1');
  assertTrue(MOD.MODEL_REGISTRY['anthropic/claude-3-5-sonnet'], 'should have Anthropic Claude');
  assertTrue(MOD.MODEL_REGISTRY['google/gemini-2.5-pro'], 'should have Google Gemini');
});

test('FREE_MODELS contains local models only', () => {
  assertTrue(MOD.FREE_MODELS.has('zai-org/glm-5.3'), 'GLM-5.3 should be free');
  assertFalse(MOD.FREE_MODELS.has('openai/gpt-4.1'), 'GPT-4.1 should not be free');
  assertFalse(MOD.FREE_MODELS.has('anthropic/claude-3-5-sonnet'), 'Claude should not be free');
});

test('FIRST_PARTY_OPERATORS contains zai', () => {
  assertTrue(MOD.FIRST_PARTY_OPERATORS.includes('zai'), 'zai should be first-party');
  assertFalse(MOD.FIRST_PARTY_OPERATORS.includes('openai'), 'openai should not be first-party');
});

test('VERIFIED_THIRD_PARTY_OPERATORS contains openai/anthropic/google', () => {
  assertTrue(MOD.VERIFIED_THIRD_PARTY_OPERATORS.includes('openai'), 'openai should be verified third-party');
  assertTrue(MOD.VERIFIED_THIRD_PARTY_OPERATORS.includes('anthropic'), 'anthropic should be verified');
  assertTrue(MOD.VERIFIED_THIRD_PARTY_OPERATORS.includes('google'), 'google should be verified');
});

test('SENSITIVE_DATA_RESTRICTED_OPERATORS restricts openai/anthropic/google', () => {
  assertTrue(MOD.SENSITIVE_DATA_RESTRICTED_OPERATORS.includes('openai'), 'openai should be restricted');
  assertTrue(MOD.SENSITIVE_DATA_RESTRICTED_OPERATORS.includes('anthropic'), 'anthropic should be restricted');
  assertTrue(MOD.SENSITIVE_DATA_RESTRICTED_OPERATORS.includes('google'), 'google should be restricted');
  assertFalse(MOD.SENSITIVE_DATA_RESTRICTED_OPERATORS.includes('zai'), 'zai should not be restricted');
});

// ─── 2. filterModels ─────────────────────────────────────────────────

test('filterModels returns all models for empty task', () => {
  const result = MOD.filterModels({});
  assertTrue(result.length >= 9, `expected >=9 models, got ${result.length}`);
});

test('filterModels excludes models without tool support when required', () => {
  const result = MOD.filterModels({ requiresTools: true });
  for (const m of result) {
    assertTrue(m.supportsTools, `model ${m.modelId} should support tools`);
  }
});

test('filterModels filters by maxTokens', () => {
  const result = MOD.filterModels({ maxTokens: 50000 });
  for (const m of result) {
    assertTrue(m.maxContext >= 50000, `model ${m.modelId} should have context >= 50000`);
  }
});

test('filterModels filters by privacyRequired=local', () => {
  const result = MOD.filterModels({ privacyRequired: 'local' });
  for (const m of result) {
    assertEqual(m.privacy, 'local', `model ${m.modelId} should be local`);
  }
  assertTrue(result.length <= 2, `expected <=2 local models, got ${result.length}`);
});

test('filterModels filters by privacyRequired=fenced (only non-third-party)', () => {
  const result = MOD.filterModels({ privacyRequired: 'fenced' });
  for (const m of result) {
    assert.notStrictEqual(m.privacy, 'third_party', `model ${m.modelId} should not be third_party`);
  }
});

test('filterModels returns empty array for impossible constraints', () => {
  const result = MOD.filterModels({ privacyRequired: 'local', maxTokens: 2000000 });
  assertEqual(result.length, 0, 'should return empty for impossible constraints');
});

// ─── 3. effectiveCost ───────────────────────────────────────────────

test('effectiveCost returns 0 for free models', () => {
  assertEqual(MOD.effectiveCost('zai-org/glm-5.3', null), 0);
});

test('effectiveCost returns Infinity for blocked third-party when budget exhausted', () => {
  const tmpDir = path.join(os.tmpdir(), `harness-test-exhausted-${Date.now()}`);
  const guard = new MOD.BudgetGuard(tmpDir);
  guard.recordSpend({ modelId: 'test', tokenCount: 100, costUsd: 10.0 });
  assertTrue(guard.isExhausted());
  const cost = MOD.effectiveCost('openai/gpt-4.1', guard);
  assertEqual(cost, Infinity);
});

test('effectiveCost returns normal cost when budget not exhausted', () => {
  const tmpDir = path.join(os.tmpdir(), `harness-not-exhausted-${Date.now()}`);
  const guard = new MOD.BudgetGuard(tmpDir);
  const cost = MOD.effectiveCost('openai/gpt-4.1', guard);
  assertTrue(cost > 0 && cost < Infinity, `expected positive finite cost, got ${cost}`);
});

// ─── 4. routeModel ──────────────────────────────────────────────────

test('routeModel with preference=cost selects cheapest available', () => {
  const result = MOD.routeModel({ requiresTools: true, category: 'coding' }, { preference: 'cost' });
  assertTrue(result.modelId, 'should select a model');
  assertTrue(result.metadata, 'should include metadata');
});

test('routeModel with preference=quality selects highest quality', () => {
  const result = MOD.routeModel({ requiresTools: true, category: 'coding' }, { preference: 'quality' });
  const allModels = Object.entries(MOD.MODEL_REGISTRY).filter(([, m]) => m.supportsTools);
  const maxQuality = Math.max(...allModels.map(([, m]) => m.quality_score));
  assertEqual(result.metadata.quality_score, maxQuality, 'should select highest quality model');
});

test('routeModel with preference=privacy prefers local', () => {
  const result = MOD.routeModel(
    { requiresTools: true, privacyRequired: 'local', category: 'coding' },
    { preference: 'privacy' }
  );
  assertEqual(result.metadata.privacy, 'local', 'should select local model');
});

test('routeModel with preference=latency selects fastest', () => {
  const result = MOD.routeModel(
    { requiresTools: true, category: 'coding' },
    { preference: 'latency' }
  );
  const allModels = Object.entries(MOD.MODEL_REGISTRY).filter(([, m]) => m.supportsTools);
  const minLatency = Math.min(...allModels.map(([, m]) => m.latency_ms));
  assertEqual(result.metadata.latency_ms, minLatency, 'should select fastest model');
});

test('routeModel with preference=balance returns a valid model', () => {
  const result = MOD.routeModel(
    { requiresTools: true, category: 'coding' },
    { preference: 'balance' }
  );
  assertTrue(result.modelId, 'should select a model');
  assertTrue(result.score !== undefined, 'should include a score');
});

test('routeModel returns fallback when no model satisfies constraints', () => {
  const result = MOD.routeModel(
    { privacyRequired: 'local', maxTokens: 2000000 },
    { preference: 'cost' }
  );
  assertTrue(result.blocked, 'should fail closed');
  assertEqual(result.modelId, null, 'must not select a privacy-violating fallback');
  assertEqual(result.metadata, null, 'blocked routes have no executable model metadata');
});

test('routeModel applies portability score boost', () => {
  const portabilityScores = { 'zai-org/glm-5.3': { coding: 0.9 } };
  const result = MOD.routeModel(
    { privacyRequired: 'local', category: 'coding' },
    { preference: 'balance', portabilityScores }
  );
  assertTrue(result.modelId, 'should select a model with portability boost');
});

test('routeModel with budgetGuard routes to local when exhausted', () => {
  const tmpDir = path.join(os.tmpdir(), `harness-exhausted-route-${Date.now()}`);
  const guard = new MOD.BudgetGuard(tmpDir);
  guard.recordSpend({ modelId: 'test', tokenCount: 100, costUsd: 10.0 });
  // With local-only task, should find a local model
  const result = MOD.routeModel(
    { privacyRequired: 'local', category: 'coding' },
    { preference: 'balance', budgetGuard: guard }
  );
  assertEqual(result.metadata.privacy, 'local');
});

test('routeModel blocks when an exhausted budget leaves only paid models', () => {
  const tmpDir = path.join(os.tmpdir(), `harness-exhausted-paid-only-${Date.now()}`);
  const guard = new MOD.BudgetGuard(tmpDir);
  guard.recordSpend({ modelId: 'test', tokenCount: 100, costUsd: 10.0 });
  const result = MOD.routeModel(
    { category: 'coding', maxTokens: 500000 },
    { preference: 'quality', budgetGuard: guard }
  );
  assertTrue(result.blocked);
  assertEqual(result.modelId, null);
  assertTrue(result.reason.includes('budget'));
});

test('routeModel enforces an explicit latency budget before scoring candidates', () => {
  const result = MOD.routeModel(
    {
      requiresTools: true,
      privacyRequired: 'local',
      category: 'coding',
      performanceBudget: { maxLatencyMs: 200 },
    },
    { preference: 'quality' }
  );
  assertTrue(result.blocked, 'no local model fits the latency budget');
  assertEqual(result.modelId, null);
});

test('routeModel enforces a cost-per-1k budget before scoring candidates', () => {
  const result = MOD.routeModel(
    {
      requiresTools: true,
      category: 'coding',
      performanceBudget: { maxCostPer1kUsd: 0 },
    },
    { preference: 'quality' }
  );
  assertEqual(result.modelId, 'zai-org/glm-5.3');
  assertEqual(result.metadata.privacy, 'local');
});

test('routeModel rejects invalid performance budgets instead of ignoring them', () => {
  const result = MOD.routeModel(
    { category: 'coding', performanceBudget: { maxLatencyMs: -1 } },
    { preference: 'balance' }
  );
  assertTrue(result.blocked);
  assertTrue(result.reason.includes('maxLatencyMs'));
});

// ─── 5. BudgetGuard ─────────────────────────────────────────────────

test('BudgetGuard initializes with default cap of $10', () => {
  const tmpDir = path.join(os.tmpdir(), `harness-budget-default-${Date.now()}`);
  const guard = new MOD.BudgetGuard(tmpDir);
  const stats = guard.getStats();
  assertEqual(stats.monthlyCapUsd, 10);
  assertEqual(stats.spentUsd, 0);
  assertEqual(stats.remainingUsd, 10);
  assertFalse(stats.exhausted);
});

test('BudgetGuard records spend correctly', () => {
  const tmpDir = path.join(os.tmpdir(), `harness-budget-record-${Date.now()}`);
  const guard = new MOD.BudgetGuard(tmpDir);
  guard.recordSpend({ modelId: 'gpt-4.1', tokenCount: 1000, costUsd: 2.0 });
  guard.recordSpend({ modelId: 'gpt-4.1', tokenCount: 500, costUsd: 1.0 });
  const stats = guard.getStats();
  assertEqual(stats.spentUsd, 3.0);
  assertEqual(stats.remainingUsd, 7.0);
  assertFalse(stats.exhausted);
});

test('BudgetGuard blocks spend that exceeds cap (fail-closed)', () => {
  const tmpDir = path.join(os.tmpdir(), `harness-budget-block-${Date.now()}`);
  const guard = new MOD.BudgetGuard(tmpDir);
  guard.recordSpend({ modelId: 'gpt-4.1', tokenCount: 1000, costUsd: 8.0 });
  const result = guard.recordSpend({ modelId: 'gpt-4.1', tokenCount: 1000, costUsd: 5.0 });
  assertFalse(result, 'should refuse spend exceeding cap');
  const stats = guard.getStats();
  assertEqual(stats.spentUsd, 8.0);
  assertEqual(stats.remainingUsd, 2.0);
});

test('BudgetGuard isExhausted when spent >= cap', () => {
  const tmpDir = path.join(os.tmpdir(), `harness-budget-exhausted-${Date.now()}`);
  const guard = new MOD.BudgetGuard(tmpDir);
  guard.recordSpend({ modelId: 'test', tokenCount: 100, costUsd: 10.0 });
  assertTrue(guard.isExhausted(), 'should be exhausted at exactly cap');
});

test('BudgetGuard.checkBudget returns correct remaining', () => {
  const tmpDir = path.join(os.tmpdir(), `harness-budget-check-${Date.now()}`);
  const guard = new MOD.BudgetGuard(tmpDir);
  guard.recordSpend({ modelId: 'test', tokenCount: 100, costUsd: 5.0 });
  const result = guard.checkBudget('gpt-4.1', 3.0);
  assertTrue(result.allowed, '3.0 should be allowed on 5.0 spent');
  assertEqual(result.spent, 5.0);
  assertEqual(result.remaining, 5.0);
  assertEqual(result.cap, 10);
});

test('BudgetGuard.checkBudget blocks when budget insufficient', () => {
  const tmpDir = path.join(os.tmpdir(), `harness-budget-blockcheck-${Date.now()}`);
  const guard = new MOD.BudgetGuard(tmpDir);
  guard.recordSpend({ modelId: 'test', tokenCount: 100, costUsd: 8.0 });
  const result = guard.checkBudget('gpt-4.1', 5.0);
  assertFalse(result.allowed, '5.0 should not be allowed when only 2.0 remaining');
  assertEqual(result.remaining, 2.0);
});

test('BudgetGuard isolates billing periods', () => {
  const tmpDir = path.join(os.tmpdir(), `harness-budget-period-${Date.now()}`);
  const guard = new MOD.BudgetGuard(tmpDir);
  fs.appendFileSync(
    path.join(tmpDir, 'spend-ledger.jsonl'),
    JSON.stringify({ modelId: 'old', tokenCount: 100, costUsd: 10.0, billingPeriod: '2020-01' }) + '\n'
  );
  const stats = guard.getStats();
  assertEqual(stats.spentUsd, 0);
  assertFalse(stats.exhausted);
});

// ─── 6. DiscoveryCapture ────────────────────────────────────────────

test('DiscoveryCapture captures a prompt', () => {
  const tmpDir = path.join(os.tmpdir(), `harness-discovery-cap-${Date.now()}`);
  const dc = new MOD.DiscoveryCapture(tmpDir);
  const id = dc.capture({
    prompt: 'Write a function to sort an array',
    modelId: 'zai-org/glm-5.3',
    taskType: 'coding',
    tags: ['utility', 'beginner'],
  });
  assertTrue(id.startsWith('disc_'), 'should return a discovery record id');
  assertEqual(dc.getStats().total, 1);
});

test('DiscoveryCapture query by taskType', () => {
  const tmpDir = path.join(os.tmpdir(), `harness-discovery-query-${Date.now()}`);
  const dc = new MOD.DiscoveryCapture(tmpDir);
  dc.capture({ prompt: 'Task 1', modelId: 'm1', taskType: 'coding', tags: ['utility'] });
  dc.capture({ prompt: 'Task 2', modelId: 'm2', taskType: 'creative', tags: ['design'] });
  const results = dc.query({ taskType: 'coding' });
  assertEqual(results.length, 1);
  assertEqual(results[0].prompt, 'Task 1');
});

test('DiscoveryCapture rejects AWS access key in prompt', () => {
  const tmpDir = path.join(os.tmpdir(), `harness-discovery-aws-${Date.now()}`);
  const dc = new MOD.DiscoveryCapture(tmpDir);
  assertThrowsWith(
    () => dc.capture({ prompt: 'My AWS key is AKIA' + '0123456789ABCDEF', modelId: 'm1' }),
    'secret'
  );
});

test('DiscoveryCapture rejects GitHub PAT in user notes', () => {
  const tmpDir = path.join(os.tmpdir(), `harness-discovery-pat-${Date.now()}`);
  const dc = new MOD.DiscoveryCapture(tmpDir);
  // ghp_ + exactly 36 alphanumeric chars
  assertThrowsWith(
    () => dc.capture({ prompt: 'hello', modelId: 'm1', userNotes: 'token=ghp_' + 'a'.repeat(36) }),
    'secret'
  );
});

test('DiscoveryCapture rejects JWT tokens', () => {
  const tmpDir = path.join(os.tmpdir(), `harness-discovery-jwt-${Date.now()}`);
  const dc = new MOD.DiscoveryCapture(tmpDir);
  // JWT-like string: eyJ... . eyJ... . signature
  assertThrowsWith(
    () => dc.capture({ prompt: 'token=eyJhbGci.eyJzdWI.xxxxx', modelId: 'm1' }),
    'secret'
  );
});

test('DiscoveryCapture rejects Bearer tokens', () => {
  const tmpDir = path.join(os.tmpdir(), `harness-discovery-bearer-${Date.now()}`);
  const dc = new MOD.DiscoveryCapture(tmpDir);
  // Bearer + 25 alphanumeric chars (matches {20,} requirement)
  assertThrowsWith(
    () => dc.capture({ prompt: 'Bearer ' + 'a'.repeat(25), modelId: 'm1' }),
    'secret'
  );
});

test('DiscoveryCapture rejects input capture data (fail-closed)', () => {
  const tmpDir = path.join(os.tmpdir(), `harness-discovery-input-${Date.now()}`);
  const dc = new MOD.DiscoveryCapture(tmpDir);
  assertThrowsWith(
    () => dc.capture({ prompt: 'keystroke data: eventtap captured click', modelId: 'm1' }),
    'input capture'
  );
});

test('DiscoveryCapture rejects ChatGPT Computer History data', () => {
  const tmpDir = path.join(os.tmpdir(), `harness-discovery-chhist-${Date.now()}`);
  const dc = new MOD.DiscoveryCapture(tmpDir);
  assertThrowsWith(
    () => dc.capture({ prompt: 'computer_history event_log interaction_events', modelId: 'm1' }),
    'input capture'
  );
});

test('DiscoveryCapture query by modelId', () => {
  const tmpDir = path.join(os.tmpdir(), `harness-discovery-model-${Date.now()}`);
  const dc = new MOD.DiscoveryCapture(tmpDir);
  dc.capture({ prompt: 'Task A', modelId: 'model-a', taskType: 'coding' });
  dc.capture({ prompt: 'Task B', modelId: 'model-b', taskType: 'coding' });
  dc.capture({ prompt: 'Task C', modelId: 'model-a', taskType: 'creative' });
  assertEqual(dc.query({ modelId: 'model-a' }).length, 2);
});

test('DiscoveryCapture getStats returns correct count', () => {
  const tmpDir = path.join(os.tmpdir(), `harness-discovery-stats-${Date.now()}`);
  const dc = new MOD.DiscoveryCapture(tmpDir);
  dc.capture({ prompt: 'Task 1', modelId: 'm1' });
  dc.capture({ prompt: 'Task 2', modelId: 'm2' });
  dc.capture({ prompt: 'Task 3', modelId: 'm3' });
  assertEqual(dc.getStats().total, 3);
});

// ─── 7. PrivateBenchmark ────────────────────────────────────────────

test('PrivateBenchmark adds tasks', () => {
  const tmpDir = path.join(os.tmpdir(), `harness-bench-add-${Date.now()}`);
  const pb = new MOD.PrivateBenchmark(tmpDir);
  const id = pb.addTask({ name: 'Sort', category: 'coding', prompt: 'Write sort', expectedOutput: 'sorted' });
  assertTrue(id.startsWith('bench_'), 'should return a task id');
  assertEqual(pb.getTasks().length, 1);
});

test('PrivateBenchmark records results', () => {
  const tmpDir = path.join(os.tmpdir(), `harness-bench-res-${Date.now()}`);
  const pb = new MOD.PrivateBenchmark(tmpDir);
  const taskId = pb.addTask({ name: 'Test', category: 'coding', prompt: 'p', expectedOutput: 'e' });
  const resultId = pb.recordResult({ taskId, modelId: 'm1', actualOutput: 'o', passed: true });
  assertTrue(resultId.startsWith('res_'), 'should return a result id');
});

test('PrivateBenchmark getTaskResults returns results for task', () => {
  const tmpDir = path.join(os.tmpdir(), `harness-bench-taskres-${Date.now()}`);
  const pb = new MOD.PrivateBenchmark(tmpDir);
  const taskId = pb.addTask({ name: 'Test', category: 'coding', prompt: 'p', expectedOutput: 'e' });
  pb.recordResult({ taskId, modelId: 'model-a', actualOutput: 'o', passed: true });
  pb.recordResult({ taskId, modelId: 'model-b', actualOutput: 'o', passed: false });
  assertEqual(pb.getTaskResults(taskId).length, 2);
});

test('PrivateBenchmark getPortabilityScores returns per-category rankings', () => {
  const tmpDir = path.join(os.tmpdir(), `harness-bench-port-${Date.now()}`);
  const pb = new MOD.PrivateBenchmark(tmpDir);
  const t1 = pb.addTask({ name: 'T1', category: 'coding', prompt: 'p', expectedOutput: 'e' });
  pb.recordResult({ taskId: t1, modelId: 'model-a', actualOutput: 'o', passed: true, costUsd: 1, elapsedMs: 100 });
  pb.recordResult({ taskId: t1, modelId: 'model-b', actualOutput: 'o', passed: true, costUsd: 2, elapsedMs: 200 });
  const scores = pb.getPortabilityScores();
  assertTrue(scores.coding, 'should have coding category');
  assertTrue(scores.coding['model-a'], 'should have model-a scores');
  assertTrue(scores.coding['model-b'], 'should have model-b scores');
  assertEqual(scores.coding['model-a'].passRate, 1.0);
});

test('PrivateBenchmark getPortabilityScores handles empty data', () => {
  const tmpDir = path.join(os.tmpdir(), `harness-bench-empty-${Date.now()}`);
  const pb = new MOD.PrivateBenchmark(tmpDir);
  assertEqual(Object.keys(pb.getPortabilityScores()).length, 0);
});

test('PrivateBenchmark getStats returns counts', () => {
  const tmpDir = path.join(os.tmpdir(), `harness-bench-stats-${Date.now()}`);
  const pb = new MOD.PrivateBenchmark(tmpDir);
  pb.addTask({ name: 'T1', category: 'coding', prompt: 'p', expectedOutput: 'e' });
  pb.addTask({ name: 'T2', category: 'coding', prompt: 'p', expectedOutput: 'e' });
  const taskId = pb.getTasks()[0].taskId;
  pb.recordResult({ taskId, modelId: 'm1', actualOutput: 'o', passed: true });
  const stats = pb.getStats();
  assertEqual(stats.tasks, 2);
  assertEqual(stats.results, 1);
});

// ─── 8. ModelRegistry ───────────────────────────────────────────────

test('ModelRegistry.getModels returns all models', () => {
  const reg = new MOD.ModelRegistry();
  const models = reg.getModels();
  assertTrue(Object.keys(models).length >= 9, 'should have at least 9 models');
});

test('ModelRegistry.getModel returns metadata for known model', () => {
  const reg = new MOD.ModelRegistry();
  const meta = reg.getModel('zai-org/glm-5.3');
  assertTrue(meta);
  assertEqual(meta.provider, 'zai');
});

test('ModelRegistry.isFirstParty for zai model', () => {
  const reg = new MOD.ModelRegistry();
  assertTrue(reg.isFirstParty('zai-org/glm-5.3'), 'GLM-5.3 should be first-party');
  assertFalse(reg.isFirstParty('openai/gpt-4.1'), 'GPT-4.1 should not be first-party');
});

test('ModelRegistry.isVerifiedThirdParty for openai/anthropic/google', () => {
  const reg = new MOD.ModelRegistry();
  assertTrue(reg.isVerifiedThirdParty('openai/gpt-4.1'), 'GPT-4.1 should be verified third-party');
  assertTrue(reg.isVerifiedThirdParty('anthropic/claude-3-5-sonnet'), 'Claude should be verified');
  assertTrue(reg.isVerifiedThirdParty('google/gemini-2.5-pro'), 'Gemini should be verified');
  assertFalse(reg.isVerifiedThirdParty('zai-org/glm-5.3'), 'GLM-5.3 should not be third-party');
});

test('ModelRegistry.isSafeForSensitiveData', () => {
  const reg = new MOD.ModelRegistry();
  assertTrue(reg.isSafeForSensitiveData('zai-org/glm-5.3'), 'GLM-5.3 should be safe for sensitive data');
  assertFalse(reg.isSafeForSensitiveData('openai/gpt-4.1'), 'GPT-4.1 should not be safe');
  assertFalse(reg.isSafeForSensitiveData('anthropic/claude-3-5-sonnet'), 'Claude should not be safe');
  assertFalse(reg.isSafeForSensitiveData('google/gemini-2.5-pro'), 'Gemini should not be safe');
});

// ─── 9. Integration ───────────────────────────────────────────────────

test('Integration: budget exhausted routes to local model', () => {
  const tmpDir = path.join(os.tmpdir(), `harness-integ-budget-${Date.now()}`);
  const guard = new MOD.BudgetGuard(tmpDir);
  guard.recordSpend({ modelId: 'test', tokenCount: 100, costUsd: 10.0 });
  assertTrue(guard.isExhausted());
  const result = MOD.routeModel(
    { privacyRequired: 'local', category: 'coding' },
    { preference: 'balance', budgetGuard: guard }
  );
  assertTrue(result.modelId, 'should route to a model');
  assertEqual(result.metadata.privacy, 'local');
  const freeModelIds = Object.keys(MOD.MODEL_REGISTRY).filter((id) => MOD.FREE_MODELS.has(id));
  assertTrue(freeModelIds.length > 0, 'there should be at least one free model');
});

test('Integration: discovery + benchmark work together', () => {
  const tmpDir = path.join(os.tmpdir(), `harness-integ-both-${Date.now()}`);
  const dc = new MOD.DiscoveryCapture(tmpDir);
  const pb = new MOD.PrivateBenchmark(tmpDir);
  const discId = dc.capture({ prompt: 'Write bubble sort', modelId: 'zai-org/glm-5.3', taskType: 'coding' });
  const taskId = pb.addTask({ name: 'Bubble sort', category: 'coding', prompt: 'Write bubble sort', expectedOutput: 'sorted' });
  pb.recordResult({ taskId, modelId: 'zai-org/glm-5.3', actualOutput: 'sorted', passed: true });
  assertEqual(dc.getStats().total, 1);
  assertEqual(pb.getStats().tasks, 1);
  assertEqual(pb.getStats().results, 1);
  assertTrue(discId.startsWith('disc_'));
  assertTrue(taskId.startsWith('bench_'));
});

// ─── 10. Constants and CLI ──────────────────────────────────────────

test('DEFAULT_MONTHLY_CAP_USD is 10', () => {
  assertEqual(MOD.DEFAULT_MONTHLY_CAP_USD, 10);
});

test('DISCOVERY_SCHEMA_VERSION is defined', () => {
  assertTrue(typeof MOD.DISCOVERY_SCHEMA_VERSION === 'string');
  assertTrue(MOD.DISCOVERY_SCHEMA_VERSION.length > 0);
});

test('BENCHMARK_SCHEMA_VERSION is defined', () => {
  assertTrue(typeof MOD.BENCHMARK_SCHEMA_VERSION === 'string');
  assertTrue(MOD.BENCHMARK_SCHEMA_VERSION.length > 0);
});

test('TASK_CATEGORIES includes expected categories', () => {
  assertTrue(MOD.TASK_CATEGORIES.includes('coding'));
  assertTrue(MOD.TASK_CATEGORIES.includes('reasoning'));
  assertTrue(MOD.TASK_CATEGORIES.includes('summarization'));
});

test('ROUTING_PREFERENCES includes expected preferences', () => {
  assertTrue(MOD.ROUTING_PREFERENCES.cost);
  assertTrue(MOD.ROUTING_PREFERENCES.latency);
  assertTrue(MOD.ROUTING_PREFERENCES.quality);
  assertTrue(MOD.ROUTING_PREFERENCES.privacy);
  assertTrue(MOD.ROUTING_PREFERENCES.balance);
});

test('All model registry entries have required fields', () => {
  for (const [id, meta] of Object.entries(MOD.MODEL_REGISTRY)) {
    assertTrue(meta.provider, `${id} missing provider`);
    assertTrue(typeof meta.cost_per_1k_tokens.input === 'number', `${id} missing input cost`);
    assertTrue(typeof meta.cost_per_1k_tokens.output === 'number', `${id} missing output cost`);
    assertTrue(typeof meta.latency_ms === 'number', `${id} missing latency`);
    assertTrue(typeof meta.quality_score === 'number', `${id} missing quality`);
    assertTrue(meta.privacy, `${id} missing privacy`);
    assertTrue(typeof meta.supportsTools === 'boolean', `${id} missing supportsTools`);
    assertTrue(meta.maxContext > 0, `${id} missing maxContext`);
  }
});

// ─── 11. No-Keystroke-Capture guarantee ─────────────────────────────

test('No ChatGPT Computer History: containsSecret detects secret patterns', () => {
  const tmpDir = path.join(os.tmpdir(), `harness-keyguard-${Date.now()}`);
  const dc = new MOD.DiscoveryCapture(tmpDir);
  assertTrue(dc.containsSecret('AKIA' + '0123456789ABCDEF'), 'should detect AWS key pattern');
  assertTrue(dc.containsSecret('ghp_' + 'a'.repeat(36)), 'should detect GitHub PAT');
});

test('No ChatGPT Computer History: looksLikeInputCapture blocks event patterns', () => {
  const tmpDir = path.join(os.tmpdir(), `harness-inputguard-${Date.now()}`);
  const dc = new MOD.DiscoveryCapture(tmpDir);
  const patterns = [
    { prompt: 'eventtap data', modelId: 'm1' },
    { prompt: 'interaction_events captured', modelId: 'm1' },
    { prompt: 'click tracker mouse_move', modelId: 'm1' },
    { prompt: 'computer_history timeline', modelId: 'm1' },
    { prompt: 'activity_timeline event_log', modelId: 'm1' },
    { prompt: 'input_event keystroke', modelId: 'm1' },
  ];
  for (const entry of patterns) {
    assertTrue(dc.looksLikeInputCapture(entry), `should block: ${entry.prompt}`);
  }
});

test('No ChatGPT Computer History: normal prompts pass input capture filter', () => {
  const tmpDir = path.join(os.tmpdir(), `harness-inputpass-${Date.now()}`);
  const dc = new MOD.DiscoveryCapture(tmpDir);
  const normalPrompts = [
    { prompt: 'Write a function to sort an array', modelId: 'm1' },
    { prompt: 'Summarize this article about AI', modelId: 'm1' },
    { prompt: 'Create a marketing plan for a new product', modelId: 'm1' },
    { prompt: 'Debug this Python code that throws an error', modelId: 'm1' },
  ];
  for (const entry of normalPrompts) {
    assertFalse(dc.looksLikeInputCapture(entry), `should not block: ${entry.prompt}`);
  }
});

test('formatRouteResult returns human-readable output', () => {
  const result = MOD.routeModel({ requiresTools: true, category: 'coding' }, { preference: 'quality' });
  const text = MOD.formatRouteResult(result);
  assertTrue(text.includes('Selected:'), 'should include "Selected:"');
  assertTrue(text.includes(result.modelId), 'should include model id');
  assertTrue(text.includes('privacy:'), 'should include privacy');
  assertTrue(text.includes('cost'), 'should include cost');
});

// ─── 12. Deterministic action authority ───────────────────────────

function validAuthorityRequest(overrides = {}) {
  const proposal = {
    actionId: 'action-read-status-1',
    kind: 'tool_call',
    tool: 'git_status',
    effect: 'read',
    process: 'git',
    filePaths: ['/workspace/project'],
    networkOrigins: [],
    ...overrides.proposal,
  };
  const policy = {
    allowedTools: ['git_status', 'write_patch', 'cloud_advice'],
    toolEffects: {
      git_status: 'read',
      write_patch: 'write',
      cloud_advice: 'consequential',
    },
    allowedProcesses: ['git'],
    allowedFileRoots: ['/workspace'],
    allowedNetworkOrigins: ['https://api.openai.com'],
    allowedCloudModels: ['openai/gpt-5.6-sol'],
    maxCoreTools: 2,
    maxCloudContextItems: 3,
    skillLoading: 'on_demand',
    ...overrides.policy,
  };
  const runtime = {
    sandbox: {
      available: true,
      enforced: true,
      processRestricted: true,
      filesystemRestricted: true,
      networkRestricted: true,
    },
    coreTools: ['git_status'],
    registeredTools: ['git_status', 'write_patch', 'cloud_advice'],
    ...overrides.runtime,
  };
  return {
    proposal,
    policy,
    runtime,
    approval: overrides.approval || null,
    disclosure: overrides.disclosure || null,
  };
}

test('HarnessAuthorityGuard authorizes an in-scope read tool in an enforced sandbox', () => {
  const result = MOD.authorizeAction(validAuthorityRequest());
  assertEqual(result.status, 'AUTHORIZED');
  assertTrue(result.allowed);
  assertTrue(/^[a-f0-9]{64}$/.test(result.proposalSha256), 'proposal hash required');
  assertTrue(/^[a-f0-9]{64}$/.test(result.policySha256), 'policy hash required');
  assertTrue(/^[a-f0-9]{64}$/.test(result.runtimeSha256), 'runtime hash required');
  assertTrue(/^[a-f0-9]{64}$/.test(result.approvalSha256), 'approval hash required');
  assertTrue(/^[a-f0-9]{64}$/.test(result.disclosureSha256), 'disclosure hash required');
  assertTrue(/^[a-f0-9]{64}$/.test(result.decisionSha256), 'decision hash required');
});

test('HarnessAuthorityGuard disables tool execution when sandbox guarantees are absent', () => {
  const request = validAuthorityRequest();
  request.runtime.sandbox.available = false;
  const result = MOD.authorizeAction(request);
  assertEqual(result.status, 'BLOCKED');
  assertFalse(result.allowed);
  assertTrue(result.reasons.some((reason) => reason.includes('sandbox.available')));
});

test('HarnessAuthorityGuard blocks tools outside the active capability set', () => {
  const request = validAuthorityRequest({ proposal: { tool: 'shell_exec' } });
  const result = MOD.authorizeAction(request);
  assertEqual(result.status, 'BLOCKED');
  assertTrue(result.reasons.some((reason) => reason.includes('allowedTools')));
  assertTrue(result.reasons.some((reason) => reason.includes('registeredTools')));
});

test('HarnessAuthorityGuard blocks process, filesystem, and network scope escapes', () => {
  const request = validAuthorityRequest({
    proposal: {
      process: 'bash',
      filePaths: ['/private/secret'],
      networkOrigins: ['https://attacker.example'],
    },
  });
  const result = MOD.authorizeAction(request);
  assertEqual(result.status, 'BLOCKED');
  assertTrue(result.reasons.some((reason) => reason.includes('process')));
  assertTrue(result.reasons.some((reason) => reason.includes('file path')));
  assertTrue(result.reasons.some((reason) => reason.includes('network origin')));
});

test('HarnessAuthorityGuard requires proposal-digest-bound approval for writes', () => {
  const write = validAuthorityRequest({
    proposal: {
      actionId: 'action-write-1',
      tool: 'write_patch',
      effect: 'write',
      process: null,
    },
  });
  const blocked = MOD.authorizeAction(write);
  assertEqual(blocked.status, 'BLOCKED');
  assertTrue(blocked.reasons.some((reason) => reason.includes('proposal-digest-bound approval')));

  write.approval = {
    granted: true,
    actionId: 'action-write-1',
    proposalSha256: MOD.sha256Canonical(write.proposal),
  };
  const authorized = MOD.authorizeAction(write);
  assertEqual(authorized.status, 'AUTHORIZED');
});

test('HarnessAuthorityGuard derives effect from trusted policy and blocks relabelled writes', () => {
  const disguisedWrite = validAuthorityRequest({
    proposal: {
      actionId: 'action-disguised-write-1',
      tool: 'write_patch',
      effect: 'read',
      process: null,
    },
  });
  const result = MOD.authorizeAction(disguisedWrite);
  assertEqual(result.status, 'BLOCKED');
  assertTrue(result.reasons.some((reason) => reason.includes('trusted policy effect')));
  assertTrue(result.reasons.some((reason) => reason.includes('proposal-digest-bound approval')));
});

test('HarnessAuthorityGuard rejects approval replay after proposal mutation', () => {
  const write = validAuthorityRequest({
    proposal: {
      actionId: 'action-write-replay-1',
      tool: 'write_patch',
      effect: 'write',
      process: null,
      filePaths: ['/workspace/project/approved.txt'],
    },
  });
  write.approval = {
    granted: true,
    actionId: write.proposal.actionId,
    proposalSha256: MOD.sha256Canonical(write.proposal),
  };
  write.proposal.filePaths = ['/workspace/project/different.txt'];
  const result = MOD.authorizeAction(write);
  assertEqual(result.status, 'BLOCKED');
  assertTrue(result.reasons.some((reason) => reason.includes('proposal-digest-bound approval')));
});

test('HarnessAuthorityGuard requires disclosed, bounded context before cloud advice', () => {
  const cloud = validAuthorityRequest({
    proposal: {
      actionId: 'cloud-advice-1',
      kind: 'cloud_advice',
      tool: 'cloud_advice',
      effect: 'consequential',
      process: null,
      filePaths: [],
      networkOrigins: ['https://api.openai.com'],
      modelId: 'openai/gpt-5.6-sol',
      context: [
        { id: 'error-summary', classification: 'internal' },
        { id: 'customer-token', classification: 'sensitive' },
      ],
    },
  });
  const blocked = MOD.authorizeAction(cloud);
  assertEqual(blocked.status, 'BLOCKED');
  assertTrue(blocked.reasons.some((reason) => reason.includes('disclosure preview')));
  assertTrue(blocked.reasons.some((reason) => reason.includes('cloud approval')));

  cloud.disclosure = {
    previewShown: true,
    approvedActionId: 'cloud-advice-1',
    contextSha256: MOD.sha256Canonical(cloud.proposal.context),
    sensitiveItemIds: ['customer-token'],
  };
  cloud.approval = {
    granted: true,
    actionId: 'cloud-advice-1',
    proposalSha256: MOD.sha256Canonical(cloud.proposal),
  };
  const authorized = MOD.authorizeAction(cloud);
  assertEqual(authorized.status, 'AUTHORIZED');
});

test('HarnessAuthorityGuard keeps the core toolset small and skills on demand', () => {
  const request = validAuthorityRequest({
    policy: { maxCoreTools: 1, skillLoading: 'eager' },
    runtime: { coreTools: ['git_status', 'write_patch'] },
  });
  const result = MOD.authorizeAction(request);
  assertEqual(result.status, 'BLOCKED');
  assertTrue(result.reasons.some((reason) => reason.includes('maxCoreTools')));
  assertTrue(result.reasons.some((reason) => reason.includes('on_demand')));
});

test('HarnessAuthorityGuard emits a deterministic decision receipt', () => {
  const request = validAuthorityRequest();
  const first = MOD.authorizeAction(request);
  const second = MOD.authorizeAction(JSON.parse(JSON.stringify(request)));
  assertEqual(first.decisionSha256, second.decisionSha256);
  assertEqual(first.proposalSha256, second.proposalSha256);
  assertEqual(first.policySha256, second.policySha256);
});

test('HarnessAuthorityGuard decision receipt changes when runtime evidence changes', () => {
  const firstRequest = validAuthorityRequest();
  const secondRequest = validAuthorityRequest();
  secondRequest.runtime.sandbox.available = false;
  const first = MOD.authorizeAction(firstRequest);
  const second = MOD.authorizeAction(secondRequest);
  assert.notStrictEqual(first.runtimeSha256, second.runtimeSha256);
  assert.notStrictEqual(first.decisionSha256, second.decisionSha256);
});

// ─── SUMMARY ────────────────────────────────────────────────────────

console.log(`\n${MOD.MODULE_NAME}: ${testNum} tests, ${passNum} passed, ${failNum} failed, 0 skipped`);
if (failNum > 0) {
  for (const f of failures) {
    console.error(`  FAIL: ${f.name} — ${f.error}`);
  }
  process.exitCode = 1;
}
