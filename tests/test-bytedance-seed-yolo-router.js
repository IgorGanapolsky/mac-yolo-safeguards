'use strict';

const assert = require('assert');
const {
  honesty,
  taskSignals,
  parseCatalog,
  selectRoute,
  doctor,
  SNAPSHOT_20260826,
  EXPENSIVE,
  main,
} = require('../tools/bytedance-seed-yolo-router.js');

const HEALTHY_SPEND = Object.freeze({
  ok: true, remainingUsd: 8, spentUsd: 2, capUsd: 10, exhausted: false,
});

function route(task, extra = {}) {
  return selectRoute({
    task,
    catalog: extra.catalog || SNAPSHOT_20260826,
    spend: extra.spend || HEALTHY_SPEND,
    paidOk: extra.paidOk,
    preferSeed: extra.preferSeed,
  });
}

function testHonesty() {
  const h = honesty();
  assert.strictEqual(h.clonedByteDanceSeed, false);
  assert.strictEqual(h.clonedSeedance, false);
  assert.strictEqual(h.dualEditSmartRouter, false);
  assert.strictEqual(h.dualEditSeedYoloWrapper, false);
  assert.strictEqual(h.liveClaim, false);
}

function testCodingStaysGlm() {
  const r = route('implement the login form validation');
  assert.strictEqual(r.model, 'glm-coding', r.reason);
}

function testSensitiveLocal() {
  const r = route('rotate the api key and store the password');
  assert.strictEqual(r.model, 'hermes-local', r.reason);
}

function testDefaultCheapIsFlashNotTurbo() {
  const r = route('use seed to summarize this office brief');
  assert.ok(!EXPENSIVE.has(r.model), r.model);
  assert.strictEqual(r.model, 'bytedance-seed/seed-1.6-flash', r.reason);
}

function testMultimodalCheap() {
  const r = route('describe this screenshot and video frame');
  assert.ok(r.model.startsWith('bytedance-seed/'), r.model);
  assert.ok(!EXPENSIVE.has(r.model), `multimodal must not auto-turbo: ${r.model}`);
}

function testTurboNeedsPaidOk() {
  const blocked = route('use seed 2.1 turbo for this agentic multi-step tool call');
  assert.notStrictEqual(blocked.model, 'bytedance-seed/seed-2-1-turbo', blocked.reason);
  const ok = route('use seed 2.1 turbo for this agentic multi-step tool call', { paidOk: true });
  assert.strictEqual(ok.model, 'bytedance-seed/seed-2-1-turbo', ok.reason);
}

function testBudgetMissing() {
  const r = route('use seed to summarize this office brief', {
    spend: { ok: false, remainingUsd: 0, spentUsd: 0, capUsd: 10, reason: 'budget_evidence_missing' },
  });
  assert.strictEqual(r.model, 'glm-coding', r.reason);
}

function testParseIgnoresNonSeed() {
  const models = parseCatalog({
    data: [
      { id: 'ibm-granite/granite-4.1-8b', pricing: { prompt: '1', completion: '1' } },
      SNAPSHOT_20260826[0],
    ],
  });
  assert.strictEqual(models.length, 1);
  assert.strictEqual(models[0].id, 'bytedance-seed/seed-1.6-flash');
}

function testDoctor() {
  const d = doctor({ catalog: SNAPSHOT_20260826, spend: HEALTHY_SPEND });
  assert.ok(d.liveOpenRouterSeed.some((m) => m.id === 'bytedance-seed/seed-2-1-turbo'));
  assert.strictEqual(d.honesty.liveClaim, false);
}

function testSignals() {
  assert.ok(taskSignals('seed 2.1 turbo agent').asksTurbo);
  assert.ok(taskSignals('screenshot of the UI').multimodal);
}

async function mainTests() {
  testHonesty();
  testCodingStaysGlm();
  testSensitiveLocal();
  testDefaultCheapIsFlashNotTurbo();
  testMultimodalCheap();
  testTurboNeedsPaidOk();
  testBudgetMissing();
  testParseIgnoresNonSeed();
  testDoctor();
  testSignals();
  assert.strictEqual(await main(['--help']), 0);
  process.stdout.write('ok tests/test-bytedance-seed-yolo-router.js\n');
}

mainTests().catch((err) => {
  process.stderr.write(`${err.stack || err}\n`);
  process.exit(1);
});
