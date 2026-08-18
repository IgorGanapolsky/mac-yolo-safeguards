#!/usr/bin/env node
'use strict';

/**
 * test-api-token-budget-sync.js — automated $10/mo spend-sync verification.
 *
 * Covers the loop that keeps the router's $10/mo gate honest:
 *   1. Watermark month rollover resets the delta baseline (no cross-month leak).
 *   2. Sync applies a positive usage delta into the spend state.
 *   3. Gate fails closed once synced spend reaches the $10 cap.
 *   4. Traffic-log audit counts metered-route calls (z-ai/*, NIM, sakana).
 *   5. Sync never throws when the OpenRouter key is absent.
 *
 * All state writes are redirected to a temp dir; real spend/watermark untouched.
 */

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const REPO = path.resolve(__dirname, '..');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'budget-sync-test-'));
process.env.HOME = TMP; // budget guard + sync derive ~/.hermes from HOME
process.env.HERMES_TRAFFIC_PATH = path.join(TMP, 'traffic-fixture.jsonl');
process.env.OPENROUTER_API_KEY = ''; // keep network out of unit tests

// Fresh require AFTER env redirection.
const guard = require(path.join(REPO, 'tools', 'openrouter-budget-guard.js'));
const sync = require(path.join(REPO, 'tools', 'api-token-budget-sync.js'));

function writeFixture(rows) {
  fs.writeFileSync(process.env.HERMES_TRAFFIC_PATH, rows.map((r) => JSON.stringify(r)).join('\n') + '\n');
}

(async function main() {
  console.log('🧪 api-token-budget-sync suite\n');

  // Test 1: month rollover resets watermark baseline
  console.log('▶ Test 1: Watermark month rollover');
  const wmPath = path.join(TMP, '.hermes', 'api-budget-sync-watermark.json');
  fs.mkdirSync(path.dirname(wmPath), { recursive: true });
  fs.writeFileSync(wmPath, JSON.stringify({ month: '1999-01', lastOpenRouterUsage: 999.99 }));
  const wm = sync.loadWatermark();
  assert.strictEqual(wm.lastOpenRouterUsage, null, 'stale-month watermark must reset baseline');
  assert.strictEqual(wm.month, sync.monthKey(), 'watermark must adopt current month');
  console.log('  ✅ Test 1 Passed: stale watermark reset, no cross-month delta leak.\n');

  // Test 2: positive usage delta lands in monthly spend
  console.log('▶ Test 2: Usage delta applied to spend state');
  const before = guard.getBudgetPacingStatus().currentSpentUsd;
  guard.recordSpend(0.42, 'openrouter-sync', 'delta-test'); // simulate delta application path
  const after = guard.getBudgetPacingStatus().currentSpentUsd;
  assert.ok(Math.abs(after - before - 0.42) < 1e-6, `spend must grow by delta (before=${before}, after=${after})`);
  console.log(`  ✅ Test 2 Passed: spend advanced $${before.toFixed(2)} -> $${after.toFixed(2)}.\n`);

  // Test 3: gate fails closed at the $10 cap (sync + gate contract)
  console.log('▶ Test 3: Fail-closed gate at $10.00 cap');
  guard.recordSpend(9.58, 'openrouter-sync', 'cap-test'); // total now 10.00
  const gate = guard.checkGate(0.001);
  assert.strictEqual(gate.allowed, false, 'gate must block once $10.00 is reached');
  assert.strictEqual(gate.pacingStatus, 'RED');
  const pacing = guard.getBudgetPacingStatus();
  assert.strictEqual(pacing.allowPaid, false);
  console.log(`  ✅ Test 3 Passed: spend $${pacing.currentSpentUsd.toFixed(2)} -> gate RED/blocked.\n`);

  // Test 4: metered-route traffic audit counts this-month rows
  console.log('▶ Test 4: Traffic-log metered audit');
  const now = new Date();
  const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  writeFixture([
    { model: 'z-ai/glm-5.2', ts_end: `${thisMonth}-02 10:00:00` },
    { model: 'z-ai/glm-5.2', ts_end: `${thisMonth}-03 10:00:00` },
    { model: 'nemotron-super-49b', ts_end: `${thisMonth}-03 11:00:00` },
    { model: 'sakana/fugu-ultra', ts_end: `${thisMonth}-04 09:00:00` },
    { model: 'glm-5.3', ts_end: `${thisMonth}-04 10:00:00` }, // coding-plan: NOT metered
    { model: 'z-ai/glm-5.2', ts_end: '2026-07-31 23:59:00' }, // prior month: excluded
  ]);
  const audit = sync.countMeteredCallsThisMonth();
  assert.deepStrictEqual(audit.counts, {
    'openrouter-zai': 2,
    'nim-nemotron': 1,
    'sakana-fugu': 1,
  }, `audit must count only this-month metered rows: ${JSON.stringify(audit.counts)}`);
  console.log(`  ✅ Test 4 Passed: counted ${JSON.stringify(audit.counts)}.\n`);

  // Test 5: sync degrades gracefully without an OpenRouter key
  console.log('▶ Test 5: No-key graceful degradation');
  const res = await sync.syncOpenRouter();
  assert.strictEqual(res.synced, false, 'sync must not claim success without auth');
  assert.ok(typeof res.reason === 'string' && res.reason.length > 0);
  console.log(`  ✅ Test 5 Passed: synced=false, reason="${res.reason}".\n`);

  fs.rmSync(TMP, { recursive: true, force: true });
  console.log('🎉 ALL API TOKEN BUDGET SYNC TESTS PASSED (5/5)!');
})().catch((err) => {
  console.error('❌ TEST FAILURE:', err.message);
  process.exit(1);
});
