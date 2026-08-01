'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  memoryPressure,
  MODEL_TO_ROUTE,
  observedForRoute,
  loadRetiredModels,
  isRetiredModel,
  loadExpertHealth,
} = require('../tools/moe-expert-health');
const { summarizeRouteQuality } = require('../tools/route-quality-report');
const path = require('path');
const fs = require('fs');
const os = require('os');

test('MODEL_TO_ROUTE maps glm-5.2 and kimi-code-fast', () => {
  assert.equal(MODEL_TO_ROUTE['glm-5.2'], 'glm52_reasoning');
  assert.equal(MODEL_TO_ROUTE['kimi-for-coding'], 'kimi_coding_live');
  assert.equal(MODEL_TO_ROUTE['kimi-code-fast'], 'kimi_coding_live');
});

test('memoryPressure flags low free ratio', () => {
  const low = memoryPressure({ freemem: 1e9, totalmem: 32e9 });
  assert.equal(low.pressure, true);
  const ok = memoryPressure({ freemem: 16e9, totalmem: 32e9 });
  assert.equal(ok.pressure, false);
});

test('observedForRoute maps health entry into adjusted-score shape', () => {
  const health = {
    byRouteId: {
      glm52_reasoning: {
        model: 'glm-5.2',
        requests: 100,
        answerRatePct: 0,
        dead: true,
      },
    },
  };
  const obs = observedForRoute(health, 'glm52_reasoning', 'glm-5.2');
  assert.equal(obs.calls, 100);
  assert.equal(obs.successCount, 0);
  assert.equal(obs.dead, true);
});

test('loadRetiredModels merges file + env + options', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'moe-retired-'));
  const retiredPath = path.join(dir, 'retired-experts.json');
  fs.writeFileSync(
    retiredPath,
    JSON.stringify({ models: ['glm-5.2'], primary: 'kimi-code-fast', retiredAt: '2026-07-31' }),
  );
  const prev = process.env.HERMES_RETIRED_EXPERTS;
  process.env.HERMES_RETIRED_EXPERTS = 'glm-coding';
  try {
    const r = loadRetiredModels({ retiredPath, retiredModels: ['extra-dead'] });
    assert.ok(r.set.has('glm-5.2'));
    assert.ok(r.set.has('glm-coding'));
    assert.ok(r.set.has('extra-dead'));
    assert.equal(r.primary, 'kimi-code-fast');
  } finally {
    if (prev === undefined) delete process.env.HERMES_RETIRED_EXPERTS;
    else process.env.HERMES_RETIRED_EXPERTS = prev;
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('isRetiredModel matches exact and prefix aliases', () => {
  const retired = { models: ['glm-5.2'], set: new Set(['glm-5.2']) };
  assert.equal(isRetiredModel('glm-5.2', retired), true);
  assert.equal(isRetiredModel('glm-5.2/extra', retired), true);
  assert.equal(isRetiredModel('kimi-code-fast', retired), false);
});

test('summarizeRouteQuality still surfaces dead routes for history', () => {
  const rows = Array.from({ length: 20 }, () => ({
    model: 'glm-5.2',
    status: 'failure',
    empty_kind: 'empty',
    tools_offered: true,
    has_tool_calls: false,
    latency_s: 1,
  }));
  const res = summarizeRouteQuality(rows);
  assert.ok(res.dead.some((d) => d.model === 'glm-5.2'));
});
