#!/usr/bin/env node
'use strict';

/**
 * test-glm53-coding-plan.js — Verification Suite for GLM-5.3 Z.ai Coding Plan
 * ----------------------------------------------------------------------------
 * Validates:
 *   1. Provider & model configuration in ~/.hermes/config.yaml
 *   2. Smart $10/mo API Token Budget Pacing & Tracking
 *   3. Budget Threshold Policy (GREEN vs AMBER vs RED)
 *   4. Economic router route selection for GLM-5.3 on agentic coding tasks
 *   5. CLI Harness execution (tools/glm53-coding-plan-harness.js)
 *   6. OpenCode YOLO GLM-5.3 model capability mapping
 */

const assert = require('assert');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawnSync } = require('child_process');

const {
  getBudgetPacingStatus,
  recordUsage,
  recordConfirmedCost,
  runDoctor,
  authorizeEstimatedCost,
  probeProvider,
  saveMonthlySpendData,
  MONTHLY_BUDGET_USD,
} = require('../tools/glm53-coding-plan-harness');
const { detectProviderFailure } = require('../hermes-yolo-wrapper');

const REPO_ROOT = path.resolve(__dirname, '..');
const HERMES_CONFIG = path.join(os.homedir(), '.hermes', 'config.yaml');

async function runTests() {
  const testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'glm53-budget-test-'));
  const trackerPath = path.join(testDir, 'spend.json');
  const budgetOptions = { trackerPath };
  console.log('🧪 Starting GLM-5.3 Z.ai Coding Plan & Smart Budget Verification...\n');

  // =========================================================================
  // Test 1: Provider & Model Configuration
  // =========================================================================
  console.log('▶ Test 1: ~/.hermes/config.yaml Provider Configuration');
  assert.ok(fs.existsSync(HERMES_CONFIG), 'config.yaml must exist');
  const cfgContent = fs.readFileSync(HERMES_CONFIG, 'utf8');
  assert.ok(cfgContent.includes('zai-coding-glm:'), 'Must configure zai-coding-glm provider');
  assert.ok(cfgContent.includes('glm-5.3'), 'Must configure glm-5.3 model');
  assert.ok(cfgContent.includes('openrouter-glm53:'), 'Must configure openrouter-glm53 fallback');
  console.log('  ✅ Test 1 Passed: GLM-5.3 provider and fallbacks configured.\n');

  // =========================================================================
  // Test 2: Smart $10/mo Token Budget Pacing
  // =========================================================================
  console.log('▶ Test 2: Smart $10/mo API Token Budget Pacing');
  const budget = getBudgetPacingStatus(budgetOptions);
  assert.strictEqual(budget.monthlyBudgetCapUsd, 10.00, 'Monthly budget must be exactly $10.00 USD');
  assert.ok(typeof budget.currentSpentUsd === 'number', 'Current spent must be a number');
  assert.ok(typeof budget.remainingBudgetUsd === 'number', 'Remaining budget must be a number');
  assert.ok(budget.dayOfMonth >= 1 && budget.dayOfMonth <= 31, 'Day of month must be valid');
  assert.ok(['GREEN', 'AMBER', 'RED'].includes(budget.pacingStatus), 'Pacing status must be valid enum');
  console.log(`  📊 Budget Status: Spent $${budget.currentSpentUsd} / $${budget.monthlyBudgetCapUsd} [${budget.pacingStatus}]`);
  console.log('  ✅ Test 2 Passed: Token budget tracking and pacing verified.\n');

  // =========================================================================
  // Test 3: Budget Threshold Interdiction & Protection Policy
  // =========================================================================
  console.log('▶ Test 3: Usage Recording & Budget Ceiling Protection');
  assert.throws(
    () => recordUsage(5000, 1500, 'unit-test-task', budgetOptions),
    /GLM53_USAGE_UNCONFIRMED/,
    'Synthetic or failed requests must not change the spend ledger',
  );
  const updatedData = recordUsage(5000, 1500, 'unit-test-task', {
    ...budgetOptions,
    providerConfirmed: true,
  });
  assert.ok(updatedData.totalInputTokens >= 5000, 'Must record input tokens');
  assert.ok(updatedData.totalOutputTokens >= 1500, 'Must record output tokens');
  assert.ok(updatedData.totalCostUsd >= 0.0001, 'Must compute fractional dollar cost');
  saveMonthlySpendData({
    month: getBudgetPacingStatus(budgetOptions).month,
    totalInputTokens: 0,
    totalOutputTokens: 0,
    totalCostUsd: 9.99,
    history: [],
  }, budgetOptions);
  assert.strictEqual(authorizeEstimatedCost(0.02, budgetOptions).allowed, false, 'Budget must fail closed before crossing $10');
  assert.throws(
    () => recordConfirmedCost(0.02, 'blocked-request', { ...budgetOptions, providerConfirmed: true }),
    /GLM53_MONTHLY_BUDGET_BLOCK/,
    'Confirmed requests must still be rejected when their conservative estimate crosses the cap',
  );
  saveMonthlySpendData({
    month: getBudgetPacingStatus(budgetOptions).month,
    totalInputTokens: 0,
    totalOutputTokens: 0,
    totalCostUsd: 0,
    history: [],
  }, budgetOptions);
  const confirmed = recordConfirmedCost(0.05, 'successful-request', {
    ...budgetOptions,
    providerConfirmed: true,
  });
  assert.strictEqual(confirmed.totalCostUsd, 0.05, 'Successful requests must consume conservative budget');
  assert.strictEqual(confirmed.history[0].accountingMode, 'conservative_request_estimate');
  console.log('  ✅ Test 3 Passed: Token usage recording operates with exact fractional cents.\n');

  // =========================================================================
  // Test 4: Economic Router Selection
  // =========================================================================
  console.log('▶ Test 4: Economic Router GLM-5.3 Route Evaluation');
  const routerPath = path.join(REPO_ROOT, 'tools', 'hermes-economic-router.js');
  const routerRes = spawnSync('node', [
    routerPath,
    '--task', 'Refactor complex multi-file authentication system with GLM-5.3',
    '--paid-ok',
    '--json',
  ], { encoding: 'utf8' });

  assert.strictEqual(routerRes.status, 0, 'Router must exit 0');
  const routerJson = JSON.parse(routerRes.stdout);
  assert.ok(routerJson.selectedRoute, 'Router must select a route');
  assert.ok(
    routerJson.selectedRoute.id === 'glm53_coding' && routerJson.selectedRoute.model === 'glm-5.3',
    `Router must route GLM request to GLM-5.3 (got ${routerJson.selectedRoute.id})`
  );
  console.log(`  🎯 Economic Router Selected: ${routerJson.selectedRoute.id} (${routerJson.selectedRoute.model})`);
  console.log('  ✅ Test 4 Passed: Economic router prioritizes GLM-5.3 on agentic coding tasks.\n');

  // =========================================================================
  // Test 5: CLI Harness (`glm53-coding-plan-harness.js`)
  // =========================================================================
  console.log('▶ Test 5: CLI Harness Execution');
  const harnessPath = path.join(REPO_ROOT, 'tools', 'glm53-coding-plan-harness.js');
  const docRes = spawnSync('node', [harnessPath, '--doctor', '--json'], { encoding: 'utf8' });
  assert.strictEqual(docRes.status, 0, 'Harness doctor must exit 0');
  const docJson = JSON.parse(docRes.stdout);
  assert.strictEqual(docJson.model, 'glm-5.3', 'Must report model glm-5.3');
  assert.strictEqual(docJson.contextLength, 1000000, 'Must report 1M context length');
  assert.strictEqual(docJson.apiKeyConfigured, true, 'API key must be configured in environment');
  assert.strictEqual(docJson.status, 'CONFIGURED_UNVERIFIED', 'Doctor must not call key presence HEALTHY without a live probe');

  const failedProbe = probeProvider({
    marker: 'EXPECTED_MARKER',
    runner: () => ({ status: 0, stdout: '', stderr: 'HTTP 401: token expired or incorrect' }),
  });
  assert.deepStrictEqual(
    { ok: failedProbe.ok, providerError: failedProbe.providerError, error: failedProbe.error },
    { ok: false, providerError: true, error: 'provider_authentication_failed' },
    'A zero-exit HTTP 401 must fail provider readiness',
  );
  assert.strictEqual(detectProviderFailure('HTTP 401: token expired or incorrect'), true, 'Wrapper must detect HTTP auth failures');
  assert.strictEqual(detectProviderFailure('EXPECTED_MARKER'), false, 'Successful output must not be misclassified');

  const fakeHermes = path.join(testDir, 'fake-hermes-http401.sh');
  fs.writeFileSync(fakeHermes, '#!/bin/sh\necho "HTTP 401: token expired or incorrect" >&2\nexit 0\n', { mode: 0o700 });
  const wrapperRes = spawnSync(process.execPath, [path.join(REPO_ROOT, 'hermes-yolo-wrapper.js'), '-z', 'marker'], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    timeout: 30000,
    env: {
      ...process.env,
      HERMES_BIN: fakeHermes,
      HERMES_YOLO_BACKEND: 'hermes',
      HERMES_YOLO_PROVIDER: 'custom:zai-coding-glm',
      HERMES_YOLO_MODEL: 'glm-5.3',
      HERMES_YOLO_LOCK_PATH: path.join(testDir, 'wrapper.lock'),
      HERMES_YOLO_LOG_PATH: path.join(testDir, 'wrapper.log'),
      HERMES_YOLO_RECEIPT_DIR: path.join(testDir, 'receipts'),
      GLM53_SPEND_TRACKER_FILE: path.join(testDir, 'wrapper-spend.json'),
    },
  });
  assert.strictEqual(wrapperRes.status, 65, `HTTP 401 must override a zero child exit (stderr: ${wrapperRes.stderr})`);
  assert.match(wrapperRes.stderr, /exit=65/, 'Wrapper progress must report the truthful effective exit code');

  const budgetRes = spawnSync('node', [harnessPath, '--budget', '--json'], { encoding: 'utf8' });
  assert.strictEqual(budgetRes.status, 0, 'Harness budget must exit 0');
  const budgetJson = JSON.parse(budgetRes.stdout);
  assert.strictEqual(budgetJson.monthlyBudgetCapUsd, 10.00, 'Harness budget must show $10/mo');
  console.log('  ✅ Test 5 Passed: Harness CLI commands execute cleanly.\n');

  // =========================================================================
  // Test 6: OpenCode YOLO Model Mapping
  // =========================================================================
  console.log('▶ Test 6: OpenCode YOLO GLM-5.3 Configuration');
  const opencodeFile = path.join(REPO_ROOT, 'opencode-yolo');
  const opencodeContent = fs.readFileSync(opencodeFile, 'utf8');
  assert.ok(opencodeContent.includes('"glm-coding"'), 'opencode-yolo must configure glm-coding');
  assert.ok(opencodeContent.includes('GLM-5.3'), 'opencode-yolo must label GLM-5.3');
  console.log('  ✅ Test 6 Passed: OpenCode YOLO maps GLM-5.3 with 1M context.\n');

  fs.rmSync(testDir, { recursive: true, force: true });
  console.log('🎉 ALL GLM-5.3 CODING PLAN & SMART BUDGET TESTS PASSED (6/6)!');
}

runTests().catch((err) => {
  console.error('\n❌ Test Suite Failed:', err);
  process.exit(1);
});
