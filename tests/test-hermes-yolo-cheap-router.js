'use strict';

const assert = require('assert');
const { classify, selectRoute, doctor, main } = require('../tools/hermes-yolo-cheap-router.js');

const HEALTHY_SPEND = Object.freeze({
  ok: true, remainingUsd: 8, spentUsd: 2, capUsd: 10, exhausted: false,
});

function route(task, extra = {}) {
  return selectRoute({ task, spend: extra.spend || HEALTHY_SPEND, paidOk: extra.paidOk });
}

function testClassify() {
  assert.ok(classify('screenshot of the dashboard').multimodal);
  assert.ok(classify('implement login').coding);
  assert.ok(classify('use granite').asksGranite);
  assert.ok(classify('use seed').asksSeed);
}

function testImplementGlm() {
  const r = route('implement the login form validation');
  assert.strictEqual(r.lane, 'glm-coding');
  assert.strictEqual(r.model, 'glm-coding');
}

function testScreenshotSeed() {
  const r = route('describe this screenshot');
  assert.strictEqual(r.lane, 'seed');
  assert.ok(r.model.startsWith('bytedance-seed/'), r.model);
  assert.notStrictEqual(r.model, 'bytedance-seed/seed-2-1-turbo');
}

function testGraniteReason() {
  const r = route('use granite for this agentic multi-step tool call');
  assert.strictEqual(r.lane, 'granite');
  assert.strictEqual(r.model, 'ibm-granite/granite-4.1-8b');
}

function testPiiLocal() {
  const r = route('the password and api key leaked');
  assert.strictEqual(r.model, 'hermes-local');
}

function testDoctor() {
  const d = doctor({ spend: HEALTHY_SPEND });
  assert.strictEqual(d.honesty.dualEditSmartRouter, false);
  assert.strictEqual(d.honesty.liveClaim, false);
  assert.ok(/Turbo only --paid-ok/.test(d.rule));
}

async function mainTests() {
  testClassify();
  testImplementGlm();
  testScreenshotSeed();
  testGraniteReason();
  testPiiLocal();
  testDoctor();
  assert.strictEqual(await main(['--help']), 0);
  process.stdout.write('ok tests/test-hermes-yolo-cheap-router.js\n');
}

mainTests().catch((err) => {
  process.stderr.write(`${err.stack || err}\n`);
  process.exit(1);
});
