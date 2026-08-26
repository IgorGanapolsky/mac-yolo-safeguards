'use strict';

const assert = require('assert');
const {
  honesty,
  taskSignals,
  thinkingModeFor,
  parseCatalog,
  selectRoute,
  doctor,
  EXPECTED_42,
  SNAPSHOT_20260826,
  main,
} = require('../tools/ibm-granite-yolo-router.js');

const HEALTHY_SPEND = Object.freeze({
  ok: true,
  remainingUsd: 8,
  spentUsd: 2,
  capUsd: 10,
  exhausted: false,
});

const CATALOG_WITH_42 = Object.freeze([
  ...SNAPSHOT_20260826,
  {
    id: 'ibm-granite/granite-4.2-8b',
    name: 'IBM: Granite 4.2 8B',
    pricing: { prompt: '0.00000004', completion: '0.00000008' },
    context_length: 131072,
  },
  {
    id: 'ibm-granite/granite-4.2-8b:free',
    name: 'IBM: Granite 4.2 8B (free)',
    pricing: { prompt: '0', completion: '0' },
    context_length: 131072,
  },
]);

function route(task, extra = {}) {
  return selectRoute({
    task,
    catalog: extra.catalog || SNAPSHOT_20260826,
    spend: extra.spend || HEALTHY_SPEND,
    paidOk: extra.paidOk,
    preferGranite: extra.preferGranite,
    perCallCapUsd: extra.perCallCapUsd,
  });
}

function testHonesty() {
  const h = honesty();
  assert.strictEqual(h.clonedIbmGranite, false);
  assert.strictEqual(h.clonedOpenRouter, false);
  assert.strictEqual(h.dualEditWrapper, false);
  assert.strictEqual(h.dualEditSmartRouter, false);
  assert.strictEqual(h.dualEditRoutePolicy, false);
  assert.strictEqual(h.liveClaim, false);
}

function testSensitiveLocal() {
  const r = route('rotate the api key and store the password');
  assert.strictEqual(r.model, 'hermes-local', r.reason);
  assert.ok(r.signals.sensitive);
}

function testCodingStaysGlm() {
  const r = route('implement the login form validation');
  assert.strictEqual(r.model, 'glm-coding', r.reason);
  assert.ok(r.signals.coding);
}

function testNeverInvent42() {
  const r = route('use granite for this agentic multi-step tool call');
  assert.ok(!EXPECTED_42.includes(r.model), r.model);
  assert.strictEqual(r.granite42OpenRouterLive, false);
  assert.strictEqual(r.honesty.liveClaim, false);
  assert.strictEqual(r.model, 'ibm-granite/granite-4.1-8b', r.reason);
  assert.strictEqual(r.provider, 'openrouter');
  assert.strictEqual(r.commandEnv.HERMES_YOLO_MODEL, 'ibm-granite/granite-4.1-8b');
  assert.strictEqual(r.commandEnv.HERMES_GRANITE_THINKING, 'thinking');
}

function testPrefer42WhenCatalogLive() {
  const r = route('use granite to reason step by step why does this agent plan fail', {
    catalog: CATALOG_WITH_42,
  });
  assert.strictEqual(r.granite42OpenRouterLive, true);
  assert.ok(r.model.includes('granite-4.2'), r.model);
  assert.ok(r.model.endsWith(':free'), `prefer free 4.2, got ${r.model}`);
}

function testEasyUsesMicro() {
  const r = route('classify this support ticket yes or no');
  assert.strictEqual(r.model, 'ibm-granite/granite-4.0-h-micro', r.reason);
  assert.strictEqual(r.thinkingMode, 'none');
}

function testMathThinking() {
  const r = route('reason step by step why does this math proof fail');
  assert.strictEqual(r.model, 'ibm-granite/granite-4.1-8b', r.reason);
  assert.strictEqual(r.thinkingMode, 'thinking');
  assert.strictEqual(r.openRouterReasoning.enabled, true);
}

function testBudgetMissingFailClosed() {
  const r = route('use granite for this agentic multi-step tool call', {
    spend: { ok: false, remainingUsd: 0, spentUsd: 0, capUsd: 10, reason: 'budget_evidence_missing' },
  });
  assert.strictEqual(r.model, 'glm-coding', r.reason);
  assert.match(r.reason, /budget evidence missing/);
}

function testBudgetExhaustedFailClosed() {
  const r = route('use granite for this agentic multi-step tool call', {
    spend: { ok: true, remainingUsd: 0, spentUsd: 10, capUsd: 10, exhausted: true },
  });
  assert.strictEqual(r.model, 'glm-coding', r.reason);
  assert.match(r.reason, /cap exhausted/);
}

function testEmptyCatalogFailClosed() {
  const r = route('use granite for this agentic multi-step tool call', { catalog: [] });
  assert.strictEqual(r.model, 'glm-coding', r.reason);
}

function testParseCatalogIgnoresNonGranite() {
  const models = parseCatalog({
    data: [
      { id: 'openai/gpt-5', pricing: { prompt: '1', completion: '1' } },
      SNAPSHOT_20260826[0],
    ],
  });
  assert.strictEqual(models.length, 1);
  assert.strictEqual(models[0].id, 'ibm-granite/granite-4.1-8b');
}

function testSignals() {
  assert.ok(taskSignals('ssn on this form').sensitive);
  assert.ok(taskSignals('implement unit test').coding);
  assert.strictEqual(thinkingModeFor(taskSignals('classify labels')), 'none');
}

function testDoctorSnapshot() {
  const d = doctor({ catalog: SNAPSHOT_20260826, spend: HEALTHY_SPEND });
  assert.strictEqual(d.granite42OpenRouterLive, false);
  assert.strictEqual(d.honesty.liveClaim, false);
  assert.ok(d.liveOpenRouterGranite.some((m) => m.id === 'ibm-granite/granite-4.1-8b'));
}

function testCliHelp() {
  return main(['--help']).then((code) => {
    assert.strictEqual(code, 0);
  });
}

function testDefaultNotGraniteWithoutFit() {
  const r = route('what is the weather vibe today');
  assert.strictEqual(r.model, 'glm-coding', r.reason);
}

async function mainTests() {
  testHonesty();
  testSensitiveLocal();
  testCodingStaysGlm();
  testNeverInvent42();
  testPrefer42WhenCatalogLive();
  testEasyUsesMicro();
  testMathThinking();
  testBudgetMissingFailClosed();
  testBudgetExhaustedFailClosed();
  testEmptyCatalogFailClosed();
  testParseCatalogIgnoresNonGranite();
  testSignals();
  testDoctorSnapshot();
  testDefaultNotGraniteWithoutFit();
  await testCliHelp();
  process.stdout.write('ok tests/test-ibm-granite-yolo-router.js\n');
}

mainTests().catch((err) => {
  process.stderr.write(`${err.stack || err}\n`);
  process.exit(1);
});
