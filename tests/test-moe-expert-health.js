'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { memoryPressure, MODEL_TO_ROUTE, observedForRoute } = require('../tools/moe-expert-health');

test('MODEL_TO_ROUTE maps glm-5.2 to glm52_reasoning', () => {
  assert.equal(MODEL_TO_ROUTE['glm-5.2'], 'glm52_reasoning');
  assert.equal(MODEL_TO_ROUTE['kimi-for-coding'], 'kimi_coding_live');
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
