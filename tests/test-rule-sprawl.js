#!/usr/bin/env node
'use strict';

const assert = require('assert');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const TOOL = path.join(ROOT, 'tools/rule-sprawl.js');
const {
  DEMO_RULES,
  knapsackRules,
  createRetrievalBudget,
  reviewVolumeIsNotControl,
} = require(TOOL);

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  const loadAll = knapsackRules(DEMO_RULES, { evalBudget: 8, tokenBudget: 2000 });
  assert.strictEqual(loadAll.autoApply, false);
  assert.strictEqual(loadAll.capturedRevenueUsd, 0);
  assert.strictEqual(loadAll.load_all_exceeds_budget, true, 'demo load-all must exceed eval budget');
  assert.ok(loadAll.selected_eval_cost <= 8);
  assert.ok(loadAll.selected.length < DEMO_RULES.length);
  assert.ok(loadAll.selected.every((r) => r.autoApply === false));
  assert.ok(loadAll.selected.some((r) => r.id === 'secrets-exfil'), 'P0 secrets stay under budget');
  assert.ok(!loadAll.selected.some((r) => r.id === 'load-all-telemetry'), 'vanity load-all stays out');

  const greedy = knapsackRules(DEMO_RULES, { evalBudget: 100, tokenBudget: 100000 });
  assert.strictEqual(greedy.selected.length, DEMO_RULES.length);
  assert.strictEqual(greedy.autoApply, false);

  const forced = knapsackRules(
    [{ id: 'promo', severity: 'P0', evalCost: 1, tokenCost: 10, value: 99, autoApply: true }],
    { evalBudget: 8 }
  );
  assert.strictEqual(forced.selected[0].autoApply, false, 'promotion autoApply stripped');

  const volumePass = reviewVolumeIsNotControl({
    prDelta: 2,
    bugsCited: 'tns_54pct',
    testsPassed: false,
    receiptOk: false,
  });
  assert.strictEqual(volumePass.ship_allowed, false, 'PR volume is not the control');
  assert.strictEqual(volumePass.not_control, 'review_volume');
  assert.strictEqual(volumePass.tns_bugs_up_54_is_not_ours, true);
  assert.strictEqual(volumePass.autoApply, false);

  const verified = reviewVolumeIsNotControl({ testsPassed: true, receiptOk: true, prDelta: 0 });
  assert.strictEqual(verified.ship_allowed, true);
  assert.strictEqual(verified.reason, 'tests_and_receipt');
  assert.strictEqual(verified.control, 'verified_pipeline');

  const missingReceipt = reviewVolumeIsNotControl({ testsPassed: true, receiptOk: false });
  assert.strictEqual(missingReceipt.ship_allowed, false);
  assert.strictEqual(missingReceipt.reason, 'receipt_missing');

  const guard = createRetrievalBudget({ budgetMs: 200, ttlMs: 5_000 });
  let underlying = 0;
  const fetchFn = async (intent) => {
    underlying += 1;
    await delay(40);
    return [{ id: 'doc-1', text: intent }];
  };
  const batch = await Promise.all(
    Array.from({ length: 10 }, () => guard.retrieve('rule sprawl eval budget', fetchFn))
  );
  assert.strictEqual(underlying, 1, 'singleflight coalesces identical concurrent retrieves');
  assert.strictEqual(batch.length, 10);
  assert.strictEqual(guard.metrics.underlyingExecutions, 1);
  assert.strictEqual(guard.metrics.coalescedHits, 9);
  assert.ok(batch.some((r) => r.source === 'fresh'));
  assert.ok(batch.filter((r) => r.source === 'coalesced').length >= 9);

  const cached = await guard.retrieve('rule sprawl eval budget', fetchFn);
  assert.strictEqual(cached.source, 'cache');
  assert.strictEqual(cached.stale, false);
  assert.strictEqual(underlying, 1);

  const tight = createRetrievalBudget({ budgetMs: 15, ttlMs: 1_000 });
  const timed = await tight.retrieve('slow query', async () => {
    await delay(80);
    return [{ id: 'late' }];
  });
  assert.strictEqual(timed.source, 'timeout');
  assert.strictEqual(timed.stale, true);
  assert.deepStrictEqual(timed.results, []);
  assert.strictEqual(tight.metrics.timeouts, 1);

  const staleGuard = createRetrievalBudget({
    budgetMs: 15,
    ttlMs: 50,
    cache: new Map([['lessons:5:expired', { results: [{ id: 'old' }], ts: Date.now() - 10_000 }]]),
  });
  const stale = await staleGuard.retrieve('expired', async () => {
    await delay(80);
    return [{ id: 'late' }];
  });
  assert.strictEqual(stale.source, 'stale_cache');
  assert.strictEqual(stale.stale, true);
  assert.strictEqual(stale.results[0].id, 'old');

  const cli = spawnSync(process.execPath, [TOOL, '--json'], {
    encoding: 'utf8',
    cwd: ROOT,
    timeout: 5_000,
  });
  assert.strictEqual(cli.status, 0, cli.stderr || cli.stdout);
  const parsed = JSON.parse(cli.stdout);
  assert.strictEqual(parsed.capturedRevenueUsd, 0);
  assert.strictEqual(parsed.autoApply, false);
  assert.strictEqual(parsed.load_all_exceeds_budget, true);
  assert.ok(parsed.selected_eval_cost <= parsed.eval_budget);

  const reviewCli = spawnSync(process.execPath, [TOOL, '--review', '--json'], {
    encoding: 'utf8',
    cwd: ROOT,
    timeout: 5_000,
  });
  assert.strictEqual(reviewCli.status, 0, reviewCli.stderr);
  const reviewOut = JSON.parse(reviewCli.stdout);
  assert.strictEqual(reviewOut.ship_allowed, false);
  assert.strictEqual(reviewOut.not_control, 'review_volume');

  const reviewPass = spawnSync(
    process.execPath,
    [TOOL, '--review', '--tests-pass', '--receipt-ok'],
    { encoding: 'utf8', cwd: ROOT, timeout: 5_000 }
  );
  assert.strictEqual(JSON.parse(reviewPass.stdout).ship_allowed, true);

  process.stdout.write(
    `test-rule-sprawl: PASS selected=${parsed.selected.length}/${DEMO_RULES.length} ` +
      `eval=${parsed.selected_eval_cost}/${parsed.eval_budget} ` +
      `load_all=${parsed.load_all_eval_cost} coalesce_underlying=${underlying} ` +
      `review_volume_ship=false capturedRevenueUsd=0\n`
  );
}

main().catch((err) => {
  process.stderr.write(`${err && err.stack ? err.stack : err}\n`);
  process.exit(1);
});
