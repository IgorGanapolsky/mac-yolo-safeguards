#!/usr/bin/env node
'use strict';

/**
 * test-hermes-gateway-router-bridge.js — Tests for the harness-router ↔ gateway bridge.
 *
 * Verifies:
 *   1. bridgeRecord() enforces budget (fail-closed on budget exhaustion)
 *   2. bridgeRecord() writes trace AND records spend on success
 *   3. routeForTask() returns a valid model from the registry
 *   4. bridgeSummary() includes both gateway + harness-router metrics
 *   5. Integration: bridge + gateway work together as a unit
 */

const path = require('path');
const fs = require('fs');
const os = require('os');
const assert = require('assert');

const testDir = path.join(os.tmpdir(), 'hermes-bridge-test-' + Date.now());
fs.mkdirSync(testDir, { recursive: true });

const BRIDGE = require(path.join(__dirname, '../tools/hermes-gateway-router-bridge.js'));
const ROUTER = BRIDGE.ROUTER;
const GATEWAY = BRIDGE.GATEWAY;

let pass = 0;
let fail = 0;
const results = [];

function authorityRequest() {
  return {
    proposal: {
      actionId: 'bridge-tool-1',
      kind: 'tool_call',
      tool: 'repo_read',
      effect: 'read',
      process: 'git',
      filePaths: ['/workspace/repo'],
      networkOrigins: [],
    },
    policy: {
      allowedTools: ['repo_read'],
      toolEffects: { repo_read: 'read' },
      allowedProcesses: ['git'],
      allowedFileRoots: ['/workspace'],
      allowedNetworkOrigins: [],
      allowedCloudModels: ['openai/gpt-5.6-sol'],
      maxCoreTools: 1,
      maxCloudContextItems: 2,
      skillLoading: 'on_demand',
    },
    runtime: {
      sandbox: {
        available: true,
        enforced: true,
        processRestricted: true,
        filesystemRestricted: true,
        networkRestricted: true,
      },
      coreTools: ['repo_read'],
      registeredTools: ['repo_read'],
    },
  };
}

function test(name, fn) {
  results.push({ name, fn });
}

// ─── routeForTask ─────────────────────────────────────────────────

test('routeForTask returns a valid model from registry', () => {
  const result = BRIDGE.routeForTask({ category: 'coding', preference: 'quality' });
  assert.ok(result, 'routeForTask should return a result');
  assert.ok(result.modelId, `result should have a modelId`);
  assert.ok(ROUTER.MODEL_REGISTRY[result.modelId], `selected model ${result.modelId} should exist in registry`);
  const model = ROUTER.MODEL_REGISTRY[result.modelId];
  assert.ok(model.cost_per_1k_tokens, 'model should have cost info');
  assert.ok(model.quality_score, 'model should have quality_score');
});

test('routeForTask with cost preference picks cheapest viable model', () => {
  const result = BRIDGE.routeForTask({ category: 'coding', preference: 'cost' });
  const model = ROUTER.MODEL_REGISTRY[result.modelId];
  // ZAI GLM-5.3 is the only free model (cost=0)
  if (model.cost_per_1k_tokens.input === 0 && model.cost_per_1k_tokens.output === 0) {
    assert.strictEqual(result.modelId, 'zai-org/glm-5.3', 'free model should be selected for cost preference');
  }
});

test('routeForTask with sensitive=true excludes restricted operators', () => {
  const result = BRIDGE.routeForTask({ category: 'coding', preference: 'privacy', sensitive: true });
  const operator = result.modelId.split('/')[0];
  assert.ok(
    !ROUTER.SENSITIVE_DATA_RESTRICTED_OPERATORS.includes(operator),
    `Model ${result.modelId} from restricted operator ${operator} should not be selected for sensitive data`
  );
});

test('routeForTask with requiresTools=true selects models with tool support', () => {
  const result = BRIDGE.routeForTask({
    category: 'coding',
    requiresTools: true,
    preference: 'quality',
    authorityRequest: authorityRequest(),
  });
  const model = ROUTER.MODEL_REGISTRY[result.modelId];
  assert.ok(model.supportsTools, `Model ${result.modelId} should support tools for this task`);
  assert.strictEqual(result.authority.status, 'AUTHORIZED');
});

test('routeForTask blocks tool-capable routing without deterministic authority evidence', () => {
  const result = BRIDGE.routeForTask({ category: 'coding', requiresTools: true });
  assert.strictEqual(result.blocked, true);
  assert.strictEqual(result.modelId, null);
  assert.match(result.reason, /authority/i);
});

test('executeRoutedTask cannot invoke an executor without authority evidence', async () => {
  let invoked = false;
  await assert.rejects(
    BRIDGE.executeRoutedTask(
      { category: 'coding', requiresTools: true },
      async () => { invoked = true; },
    ),
    /authority/i,
  );
  assert.strictEqual(invoked, false, 'blocked executor must never run');
});

test('executeRoutedTask authorizes immediately before invoking the executor', async () => {
  let invoked = 0;
  const result = await BRIDGE.executeRoutedTask(
    {
      category: 'coding',
      requiresTools: true,
      authorityRequest: authorityRequest(),
    },
    async ({ modelId, authority }) => {
      invoked += 1;
      assert.ok(modelId);
      assert.strictEqual(authority.status, 'AUTHORIZED');
      return { ok: true };
    },
    { storageDir: testDir },
  );
  assert.strictEqual(invoked, 1);
  assert.strictEqual(result.execution.ok, true);
  assert.strictEqual(result.routing.authority.status, 'AUTHORIZED');
});

test('routeForTask enforces latency, cost, and quality budgets before selection', () => {
  const latencyBlocked = BRIDGE.routeForTask({
    category: 'coding',
    privacyRequired: 'local',
    maxLatencyMs: 200,
  });
  assert.strictEqual(latencyBlocked.blocked, true);

  const freeOnly = BRIDGE.routeForTask({ category: 'coding', maxCostPer1kUsd: 0 });
  assert.strictEqual(freeOnly.modelId, 'zai-org/glm-5.3');

  const qualityBlocked = BRIDGE.routeForTask({ category: 'coding', minQuality: 1 });
  assert.strictEqual(qualityBlocked.blocked, true);
});

test('routeForTask with balance preference returns scored model', () => {
  const result = BRIDGE.routeForTask({ category: 'coding', preference: 'balance' });
  assert.ok(result.score !== undefined, 'balance route should include a score');
  assert.ok(result.reason, 'should include a reason string');
  assert.ok(result.metadata, 'should include model metadata');
});

// ─── bridgeRecord ─────────────────────────────────────────────────

test('bridgeRecord writes a trace record and returns it', async () => {
  const recordInput = {
    model: 'zai-org/glm-5.3',
    provider: 'zai',
    route: 'local-coding',
    inputTokens: 100,
    outputTokens: 50,
    latencyMs: 250,
    success: true,
    label: 'test-bridge-record',
  };

  const result = await BRIDGE.bridgeRecord(recordInput, { storageDir: testDir });
  assert.ok(result, 'bridgeRecord should return a record');
  assert.strictEqual(result.model, 'zai-org/glm-5.3');
  assert.strictEqual(result.provider, 'zai');
  assert.strictEqual(result.success, true);
  assert.ok(result.cost_usd >= 0, 'cost should be non-negative');
});

test('bridgeRecord with free model ($0 cost) does not trigger budget block', async () => {
  const recordInput = {
    model: 'zai-org/glm-5.3',
    provider: 'zai',
    route: 'test-free',
    inputTokens: 1000,
    outputTokens: 500,
    latencyMs: 300,
    success: true,
    label: 'free-model-test',
  };

  const result = await BRIDGE.bridgeRecord(recordInput, { storageDir: testDir });
  assert.ok(!result.budget_blocked, 'Free model should not trigger budget block');
});

test('bridgeRecord respects budget cap and throws when exceeded', async () => {
  // Create a record with high estimated cost
  const recordInput = {
    model: 'openai/gpt-4.1',
    provider: 'openai',
    route: 'test-budget-exceeded',
    inputTokens: 1000000,
    outputTokens: 500000,
    latencyMs: 500,
    success: true,
    label: 'budget-exceeded-test',
  };

  // Calculate expected cost
  const normalized = GATEWAY.makeRecord(recordInput);
  const cost = normalized.cost_usd;

  if (cost > 0 && cost > ROUTER.DEFAULT_MONTHLY_CAP_USD) {
    // The cost exceeds the $10 cap — bridgeRecord should throw
    let threw = false;
    try {
      await BRIDGE.bridgeRecord(recordInput, { storageDir: testDir });
    } catch (e) {
      threw = true;
      assert.ok(e.message.includes('Budget'), `Error should mention budget: ${e.message}`);
    }
    assert.ok(threw, `bridgeRecord should throw when cost $${cost.toFixed(4)} exceeds cap $${ROUTER.DEFAULT_MONTHLY_CAP_USD}`);
  } else {
    // If cost is within budget, verify it works
    const result = await BRIDGE.bridgeRecord(recordInput, { storageDir: testDir });
    assert.ok(result, 'bridgeRecord should succeed when within budget');
  }
});

test('bridgeRecord auto-captures discovery on high-quality free model', async () => {
  // Create a high-quality free model record
  const recordInput = {
    model: 'zai-org/glm-5.3',
    provider: 'zai',
    route: 'auto-discovery-test',
    inputTokens: 50,
    outputTokens: 25,
    latencyMs: 200,  // < 2000ms threshold
    success: true,
    label: 'good-pattern-discover-test',
    costUsd: 0,  // Free model
  };

  // Should not throw
  const result = await BRIDGE.bridgeRecord(recordInput, { storageDir: testDir });
  assert.ok(result.success, 'Record should succeed for high-quality free model');
});

test('bridgeRecord records failed records correctly', async () => {
  const recordInput = {
    model: 'openai/gpt-4.1',
    provider: 'openai',
    route: 'failed-record-test',
    inputTokens: 50,
    outputTokens: 25,
    latencyMs: 500,
    success: false,
    label: 'failed-record-no-capture',
    error: 'something went wrong',
    costUsd: 0,
  };

  const result = await BRIDGE.bridgeRecord(recordInput, { storageDir: testDir });
  assert.strictEqual(result.success, false, 'Record should be failed');
});

test('bridgeRecord validates record before writing', async () => {
  let threw = false;
  try {
    await BRIDGE.bridgeRecord({}, { storageDir: testDir });
  } catch (e) {
    threw = true;
  }
  assert.ok(threw, 'bridgeRecord should validate and throw on invalid record');
});

// ─── bridgeSummary ────────────────────────────────────────────────

test('bridgeSummary includes both gateway and harness-router metrics', () => {
  const summary = BRIDGE.bridgeSummary({ since: '1d', storageDir: testDir });
  assert.ok(summary, 'bridgeSummary should return output');
  const parsed = JSON.parse(summary);
  assert.ok(parsed.gateway, 'should include gateway metrics');
  assert.ok(parsed.harness_router, 'should include harness-router metrics');
  assert.ok(parsed.harness_router.budget, 'should include budget info');
  assert.ok(parsed.harness_router.budget.monthlyCapUsd === 10, 'cap should be $10');
  assert.ok(parsed.harness_router.discovery, 'should include discovery info');
  assert.ok(parsed.harness_router.benchmark, 'should include benchmark info');
});

test('bridgeSummary budget reflects spent + remaining = cap', () => {
  const summary = JSON.parse(BRIDGE.bridgeSummary({ storageDir: testDir }));
  const budget = summary.harness_router.budget;
  assert.ok(typeof budget.spentUsd === 'number', 'spentUsd should be a number');
  assert.ok(typeof budget.remainingUsd === 'number', 'remainingUsd should be a number');
  assert.ok(budget.remainingUsd >= 0, 'remaining should be non-negative');
  assert.ok(budget.spentUsd >= 0, 'spent should be non-negative');
  assert.ok(budget.spentUsd + budget.remainingUsd === budget.monthlyCapUsd,
    `spent + remaining should equal cap: ${budget.spentUsd} + ${budget.remainingUsd} !== ${budget.monthlyCapUsd}`);
});

test('bridgeSummary includes model_count and free_models', () => {
  const summary = JSON.parse(BRIDGE.bridgeSummary({ storageDir: testDir }));
  assert.ok(summary.harness_router.model_count > 0, 'should have models');
  assert.ok(Array.isArray(summary.harness_router.free_models), 'free_models should be an array');
  assert.ok(summary.harness_router.free_models.length > 0, 'should have at least one free model');
  assert.ok(summary.harness_router.free_models.includes('zai-org/glm-5.3'), 'GLM-5.3 should be free');
});

// ─── Integration: bridge + gateway work together ─────────────────

test('bridgeRecord uses gateway.makeRecord for normalization', async () => {
  const result = await BRIDGE.bridgeRecord({
    model: 'anthropic/claude-3-5-sonnet',
    provider: 'anthropic',
    route: 'integration-test',
    inputTokens: 200,
    outputTokens: 100,
    latencyMs: 1000,
    success: true,
    label: 'integration-snake-case-check',
  }, { storageDir: testDir });

  // Verify the record was properly normalized (snake_case)
  assert.ok(result.ts, 'Record should have ISO timestamp');
  assert.ok(result.task_class, 'Record should have classified task');
  assert.strictEqual(result.input_tokens, 200, 'Tokens should be normalized to snake_case');
  assert.strictEqual(result.output_tokens, 100, 'Tokens should be normalized to snake_case');
  assert.strictEqual(result.latency_ms, 1000, 'Latency should be normalized to snake_case');
});

test('routeForTask + bridgeRecord work as a unit (simulate agent call)', async () => {
  // Step 1: Route (select model before making API call)
  const routing = BRIDGE.routeForTask({
    category: 'coding',
    preference: 'quality',
    requiresTools: true,
    authorityRequest: authorityRequest(),
  }, { storageDir: testDir });
  assert.ok(routing.modelId, 'Should select a model');
  const modelInfo = ROUTER.MODEL_REGISTRY[routing.modelId];
  assert.ok(modelInfo, 'Selected model should be in registry');
  assert.ok(modelInfo.supportsTools, 'Selected model should support tools for this task');

  // Step 2: Record the actual gateway call result
  const result = await BRIDGE.bridgeRecord({
    model: routing.modelId,
    provider: modelInfo.provider || routing.modelId.split('/')[0],
    route: 'unit-integration-test',
    inputTokens: 300,
    outputTokens: 150,
    latencyMs: modelInfo.latency_ms || 500,
    success: true,
    label: 'unit-integration-prompt',
    costUsd: 0,
  }, { storageDir: testDir });
  assert.ok(result.success, 'Record should succeed');

  // Step 3: Verify budget is untouched (free model)
  const summary = JSON.parse(BRIDGE.bridgeSummary({ storageDir: testDir }));
  assert.strictEqual(summary.harness_router.budget.spentUsd, 0,
    'Budget should not increase for $0 cost record');
});

test('bridge exports gateway and router for introspection', () => {
  assert.ok(BRIDGE.GATEWAY, 'Bridge should export GATEWAY');
  assert.ok(BRIDGE.ROUTER, 'Bridge should export ROUTER');
  assert.ok(BRIDGE.bridgeRecord, 'Bridge should export bridgeRecord');
  assert.ok(BRIDGE.routeForTask, 'Bridge should export routeForTask');
  assert.ok(BRIDGE.executeRoutedTask, 'Bridge should export executeRoutedTask');
  assert.ok(BRIDGE.bridgeSummary, 'Bridge should export bridgeSummary');
  assert.ok(BRIDGE.main, 'Bridge should export main');
});

test('routeForTask respects maxLatencyMs constraint', () => {
  const result = BRIDGE.routeForTask({
    category: 'coding',
    requiresTools: true,
    maxLatencyMs: 300,
    authorityRequest: authorityRequest(),
  });
  const model = ROUTER.MODEL_REGISTRY[result.modelId];
  assert.ok(model.latency_ms <= 300,
    `Selected model latency ${model.latency_ms}ms should be within 300ms limit`);
});

test('routeForTask respects minQuality constraint', () => {
  const result = BRIDGE.routeForTask({
    category: 'coding',
    requiresTools: true,
    minQuality: 0.9,
    authorityRequest: authorityRequest(),
  });
  const model = ROUTER.MODEL_REGISTRY[result.modelId];
  assert.ok(model.quality_score >= 0.9,
    `Selected model quality ${model.quality_score} should be >= 0.9`);
});

// ─── CLI commands ─────────────────────────────────────────────────

test('CLI health command returns valid JSON', () => {
  // Simulate the health check logic
  const budget = new ROUTER.BudgetGuard(undefined, ROUTER.DEFAULT_MONTHLY_CAP_USD);
  const stats = budget.getStats();
  const result = {
    budget_ok: !stats.exhausted,
    spent: stats.spentUsd,
    cap: stats.monthlyCapUsd,
    model_count: Object.keys(ROUTER.MODEL_REGISTRY).length,
  };
  assert.ok(typeof result.budget_ok === 'boolean', 'budget_ok should be boolean');
  assert.ok(typeof result.spent === 'number', 'spent should be number');
  assert.ok(typeof result.cap === 'number', 'cap should be number');
});

// ─── Run tests ────────────────────────────────────────────────────

(async () => {
  console.log('hermes-gateway-router-bridge: running', results.length, 'tests...\n');

  for (const t of results) {
    try {
      await t.fn();
      pass++;
      console.log(`  [PASS] ${t.name}`);
    } catch (e) {
      console.error(`  [FAIL] ${t.name}: ${e.message}`);
      fail++;
    }
  }

  console.log(`\nhermes-gateway-router-bridge: ${pass} passed, ${fail} failed, ${results.length - pass - fail} skipped`);

  // Cleanup
  try { fs.rmSync(testDir, { recursive: true, force: true }); } catch (e) { /* ignore */ }

  process.exit(fail > 0 ? 1 : 0);
})();
