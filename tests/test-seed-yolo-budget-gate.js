#!/usr/bin/env node
'use strict';

/**
 * test-seed-yolo-budget-gate.js — seed-yolo $10/mo fail-closed gate (2026-08-15).
 *
 * Regression for the jcode verification loop that respawned seed-yolo video
 * runs at ~$30/hr on bytedance-seed/seed-2-1-turbo: SEED_YOLO_ALLOW_METERED=1
 * must no longer bypass the shared budget guard. The gate fails closed when
 * the monthly cap is reached and allows when budget remains.
 */

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const REPO = path.resolve(__dirname, '..');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'seed-budget-test-'));
process.env.HOME = TMP; // guard derives ~/.hermes from HOME
process.env.OPENROUTER_API_KEY = 'sk-or-test-key';

const guard = require(path.join(REPO, 'tools', 'openrouter-budget-guard.js'));

function assertCostPolicyWithEnv(env) {
  // Load a fresh wrapper instance per scenario by busting the require cache.
  const wrapperPath = path.join(REPO, 'tools', 'seed-yolo-wrapper.js');
  delete require.cache[wrapperPath];
  // The wrapper requires ./seedance-video-engine at load; that module is pure JS.
  const mod = require(wrapperPath);
  // resolveConfig + assertCostPolicy are exercised through the exported surface
  // when present; otherwise fall back to the internal fns via a direct require
  // of the file's function exports.
  if (typeof mod.resolveConfig === 'function' && typeof mod.assertCostPolicy === 'function') {
    const cfg = mod.resolveConfig(env);
    mod.assertCostPolicy(cfg);
    return cfg;
  }
  throw new Error('seed-yolo-wrapper must export resolveConfig/assertCostPolicy for gate tests');
}

(async function main() {
  console.log('🧪 seed-yolo budget-gate suite\n');

  // Test 1: metered launch BLOCKED at exhausted budget
  console.log('▶ Test 1: Fail-closed when $10/mo exhausted');
  guard.recordSpend(10.0, 'test', 'exhaust'); // exactly at cap
  const envBlocked = {
    OPENROUTER_API_KEY: 'sk-or-test-key',
    SEED_YOLO_ALLOW_METERED: '1',
  };
  let threw = false;
  try {
    assertCostPolicyWithEnv(envBlocked);
  } catch (err) {
    threw = true;
    assert.ok(/\$10\/mo|budget|exhausted/i.test(err.message), `gate must cite budget: ${err.message}`);
  }
  assert.ok(threw, 'metered launch must throw when budget is exhausted');
  console.log('  ✅ Test 1 Passed: metered launch refused at cap.\n');

  // Test 2: metered launch ALLOWED when budget healthy
  console.log('▶ Test 2: Allowed when budget remains');
  // Reset spend state by moving to next-month key semantics: rewrite state file.
  const spendPath = path.join(TMP, '.hermes', 'openrouter-monthly-spend.json');
  const now = new Date();
  const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  fs.writeFileSync(spendPath, JSON.stringify({
    month,
    monthlyBudgetCapUsd: 10,
    currentSpentUsd: 1.0,
    totalInputTokens: 0,
    totalOutputTokens: 0,
    history: [],
  }));
  const cfg = assertCostPolicyWithEnv(envBlocked);
  assert.strictEqual(cfg.model, 'bytedance-seed/seed-2-1-turbo', 'opt-in metered default model');
  console.log('  ✅ Test 2 Passed: metered launch allowed under cap.\n');

  // Test 3: zero-cost routes never touch the gate
  console.log('▶ Test 3: Zero-cost route unaffected');
  const envFree = { OPENROUTER_API_KEY: 'sk-or-test-key' }; // no ALLOW_METERED -> openrouter/free
  const cfgFree = assertCostPolicyWithEnv(envFree);
  assert.ok(cfgFree.model === 'openrouter/free' || cfgFree.model.endsWith(':free'));
  console.log('  ✅ Test 3 Passed: free route launches regardless of budget.\n');

  fs.rmSync(TMP, { recursive: true, force: true });
  console.log('🎉 ALL SEED-YOLO BUDGET GATE TESTS PASSED (3/3)!');
})().catch((err) => {
  console.error('❌ TEST FAILURE:', err.message);
  process.exit(1);
});
