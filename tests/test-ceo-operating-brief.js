#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  MAX_HUMAN_ACTIONS,
  chiefOfStaffView,
  continuousE2eReceipt,
  rankActions,
} = require('../tools/ceo-operating-brief');

function test(name, fn) {
  try {
    fn();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    console.error(error.stack || error.message);
    process.exitCode = 1;
  }
}

function baseBrief(overrides = {}) {
  const brief = {
    telemetry: {
      gateway: { ok: true, localIp: '100.64.0.1' },
      adb: { connected: true, serial: 'device-fixture' },
      phonePipeline: { busy: false, source: 'fixture', reason: '' },
      continuousE2e: {
        exists: true,
        recent: true,
        healthy: true,
        unit: 'pass',
        e2e: 'pass',
      },
      hermesMobileTests: { skipped: true },
    },
    ml: { hermesLoop: { decision: 'GO' } },
    revenue: { sendNext: { line: '[send-next] 1 ready prospect' } },
    newsletterTop: null,
  };
  return {
    ...brief,
    ...overrides,
    telemetry: { ...brief.telemetry, ...(overrides.telemetry || {}) },
    ml: { ...brief.ml, ...(overrides.ml || {}) },
    revenue: { ...brief.revenue, ...(overrides.revenue || {}) },
  };
}

test('active phone ownership suppresses duplicate pair and E2E actions', () => {
  const brief = baseBrief({
    telemetry: {
      phonePipeline: { busy: true, source: 'process-scan', reason: 'continuous verification already running' },
      continuousE2e: { exists: true, recent: true, healthy: false, unit: 'pass', e2e: 'fail' },
    },
  });
  const actions = rankActions(brief);
  assert.strictEqual(actions.some((action) => /pair|E2E cycle/i.test(action.action)), false);
  const view = chiefOfStaffView(brief, actions);
  assert(view.valueExhaustion.some((item) => item.lane === 'device-verification'));
  assert(view.whatToIgnore.some((item) => /Do not start another pair/i.test(item)));
});

test('an idle phone with a failed receipt yields exactly one agent verifier action', () => {
  const brief = baseBrief({
    telemetry: {
      phonePipeline: { busy: false, source: 'fixture', reason: '' },
      continuousE2e: { exists: true, recent: true, healthy: false, unit: 'pass', e2e: 'fail' },
    },
  });
  const phoneActions = rankActions(brief).filter((action) => action.lane === 'product');
  assert.strictEqual(phoneActions.length, 1);
  assert.strictEqual(phoneActions[0].owner, 'agent');
  assert.match(phoneActions[0].action, /single-owner Hermes Mobile continuous E2E cycle/);
  assert.doesNotMatch(phoneActions[0].action, /pair/i);
});

test('a fresh healthy receipt creates no redundant phone work', () => {
  const actions = rankActions(baseBrief());
  assert.strictEqual(actions.some((action) => action.lane === 'product'), false);
});

test('the human decision queue is capped at three', () => {
  const brief = baseBrief();
  const actions = Array.from({ length: 5 }, (_, index) => ({
    priority: index + 1,
    lane: 'decision',
    owner: 'human',
    kind: 'decision',
    action: `Decision ${index + 1}`,
  }));
  const view = chiefOfStaffView(brief, actions);
  assert.strictEqual(MAX_HUMAN_ACTIONS, 3);
  assert.deepStrictEqual(view.humanActions.map((item) => item.action), ['Decision 1', 'Decision 2', 'Decision 3']);
});

test('an exhausted outreach lane becomes one decision, not more research', () => {
  const brief = baseBrief({
    revenue: { sendNext: { ok: true, line: '[send-next] All caught up! No prospects found in "ready" stage.' } },
  });
  const actions = rankActions(brief);
  const view = chiefOfStaffView(brief, actions);
  assert.strictEqual(view.humanActions.length, 1);
  assert.match(view.humanActions[0].action, /approved for an external send/);
  assert(view.valueExhaustion.some((item) => item.lane === 'revenue-outreach'));
  assert(view.whatToIgnore.some((item) => /Do not manufacture more prospect research/));
});

test('continuous receipt parsing distinguishes fresh proof from stale proof', () => {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'ceo-brief-receipt-'));
  const proofDir = path.join(repo, 'hermes-mobile', 'docs', 'proofs', 'continuous');
  fs.mkdirSync(proofDir, { recursive: true });
  fs.writeFileSync(path.join(proofDir, 'latest.json'), JSON.stringify({
    updatedAt: '2026-07-13T20:00:00Z',
    unit: 'pass',
    e2e: 'pass',
    detail: 'fixture',
  }));
  const fresh = continuousE2eReceipt({ repo, now: '2026-07-13T20:20:00Z' });
  const stale = continuousE2eReceipt({ repo, now: '2026-07-13T21:00:00Z' });
  assert.strictEqual(fresh.recent, true);
  assert.strictEqual(fresh.healthy, true);
  assert.strictEqual(stale.recent, false);
  fs.rmSync(repo, { recursive: true, force: true });
});

