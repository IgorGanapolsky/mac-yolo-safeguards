#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const budgetPath = path.join(root, 'tools', 'ota-publish-budget.js');
const budget = require(budgetPath);

const HOUR = 60 * 60 * 1000;
const nowMs = Date.parse('2026-07-24T18:00:00.000Z'); // afternoon ET

function runAt(iso) {
  return {
    databaseId: Math.floor(Math.random() * 1e9),
    createdAt: iso,
    status: 'completed',
    conclusion: 'success',
    event: 'workflow_dispatch',
    displayTitle: 'Hermes Mobile OTA',
  };
}

// Caps are permanent numbers from the 2026-07-23 crisis.
assert.strictEqual(budget.MAX_RUNS_48H, 3);
assert.strictEqual(budget.MAX_PROD_SUCCESS_24H, 1);
assert.strictEqual(budget.WORKFLOW_FILE, 'mobile-ota.yml');
assert.ok(budget.DEFAULT_BUDGET_EPOCH);

const epochOpts = { nowMs, epochMs: nowMs - 12 * HOUR };

// Empty history is OK.
{
  const r = budget.evaluateBudget([], { ...epochOpts, requireProductionSlot: true });
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.stats.runs48h, 0);
}

// Pre-epoch crisis spam does not count toward the 48h cap.
{
  const runs = [
    { ...runAt(new Date(nowMs - 20 * HOUR).toISOString()), databaseId: 90 },
    { ...runAt(new Date(nowMs - 19 * HOUR).toISOString()), databaseId: 91 },
    { ...runAt(new Date(nowMs - 18 * HOUR).toISOString()), databaseId: 92 },
    { ...runAt(new Date(nowMs - 17 * HOUR).toISOString()), databaseId: 93 },
  ];
  const r = budget.evaluateBudget(runs, { ...epochOpts, currentRunId: '99' });
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.stats.runs48h, 0);
}

// 3 prior post-epoch runs in 48h blocks the 4th.
{
  const runs = [
    { ...runAt(new Date(nowMs - 1 * HOUR).toISOString()), databaseId: 1, conclusion: 'failure' },
    { ...runAt(new Date(nowMs - 2 * HOUR).toISOString()), databaseId: 2, conclusion: 'cancelled' },
    { ...runAt(new Date(nowMs - 3 * HOUR).toISOString()), databaseId: 3, conclusion: 'success' },
  ];
  const r = budget.evaluateBudget(runs, { ...epochOpts, currentRunId: '99' });
  assert.strictEqual(r.ok, false);
  assert.ok(r.violations.some((v) => v.code === 'MAX_RUNS_48H'));
  assert.strictEqual(r.stats.runs48h, 3);
}

// Current run id is excluded from the count (CI self-check).
{
  const runs = [
    { ...runAt(new Date(nowMs - 1 * HOUR).toISOString()), databaseId: 10 },
    { ...runAt(new Date(nowMs - 2 * HOUR).toISOString()), databaseId: 11 },
    { ...runAt(new Date(nowMs).toISOString()), databaseId: 12 },
  ];
  const r = budget.evaluateBudget(runs, { ...epochOpts, currentRunId: '12' });
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.stats.runs48h, 2);
}

// Successful production today blocks another production slot.
{
  const runs = [
    {
      ...runAt(new Date(nowMs - 2 * HOUR).toISOString()),
      databaseId: 20,
      conclusion: 'success',
      jobs: [{ name: 'Publish production OTA (fresh-user gated)', conclusion: 'success' }],
    },
  ];
  const blocked = budget.evaluateBudget(runs, {
    ...epochOpts,
    requireProductionSlot: true,
    currentRunId: '21',
  });
  assert.strictEqual(blocked.ok, false);
  assert.ok(blocked.violations.some((v) => v.code === 'MAX_PROD_PER_DAY'));

  const previewOk = budget.evaluateBudget(runs, {
    ...epochOpts,
    channel: 'preview',
    currentRunId: '21',
  });
  assert.strictEqual(previewOk.ok, true);
}

// Skipped production job does not count as a production success.
{
  const runs = [
    {
      ...runAt(new Date(nowMs - 1 * HOUR).toISOString()),
      databaseId: 30,
      conclusion: 'success',
      jobs: [{ name: 'Publish production OTA (fresh-user gated)', conclusion: 'skipped' }],
    },
  ];
  const r = budget.evaluateBudget(runs, { ...epochOpts, requireProductionSlot: true });
  assert.strictEqual(r.ok, true);
}

// FORCE bypass requires both env flags.
assert.strictEqual(budget.forceApproved({ FORCE_OTA: '1' }), false);
assert.strictEqual(budget.forceApproved({ HERMES_OTA_FORCE_APPROVED: '1' }), false);
assert.strictEqual(
  budget.forceApproved({ FORCE_OTA: '1', HERMES_OTA_FORCE_APPROVED: '1' }),
  true,
);

{
  const code = budget.main(['--json'], {
    env: { FORCE_OTA: '1', HERMES_OTA_FORCE_APPROVED: '1' },
    fetchRuns: () => {
      throw new Error('should not fetch when forced');
    },
  });
  assert.strictEqual(code, 0);
}

// Wiring: CI + local gated path must call the budget script.
const workflow = fs.readFileSync(path.join(root, '.github/workflows/mobile-ota.yml'), 'utf8');
assert.ok(workflow.includes('ota-publish-budget.js'), 'mobile-ota.yml must run ota-publish-budget.js');
assert.ok(workflow.includes('ota-spend-budget-gate') || workflow.includes('OTA spend budget'), 'workflow must have spend budget gate');
assert.ok(!/on:\s*\n\s*push:/.test(workflow), 'must not auto-publish on push');

const gated = fs.readFileSync(path.join(root, 'hermes-mobile/scripts/ota-publish-gated.sh'), 'utf8');
assert.ok(gated.includes('ota-spend-guard.sh') || gated.includes('ota-publish-budget.js'));

const guardSh = fs.readFileSync(path.join(root, 'hermes-mobile/scripts/ota-spend-guard.sh'), 'utf8');
assert.ok(guardSh.includes('ota-publish-budget.js'));

const docs = fs.readFileSync(path.join(root, 'hermes-mobile/docs/OTA_UPDATES.md'), 'utf8');
assert.ok(docs.includes('never burn Expo overages'));
assert.ok(docs.includes('FORCE_OTA'));
assert.ok(docs.includes('HERMES_OTA_FORCE_APPROVED'));
assert.ok(docs.includes('48h') || docs.includes('48 h'));

console.log('test-ota-publish-budget: ok');
