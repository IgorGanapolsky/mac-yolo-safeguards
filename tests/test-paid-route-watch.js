'use strict';

const assert = require('assert');
const path = require('path');

const { parseLines, countPaidToday, countGlmWindow, decideAlerts } =
  require(path.resolve(__dirname, '../tools/hermes-paid-route-watch.js'));

console.log('=== Running hermes-paid-route-watch tests ===\n');

const rec = (model, status, tokens, ts) =>
  JSON.stringify({ model, status, total_tokens: tokens, ts_end: ts });

// countPaidToday: buckets NIM and OpenRouter-paid separately, skips free tier + other days
{
  const records = parseLines([
    rec('nvidia/llama-3.3-nemotron-super-49b-v1.5', 'success', 1000, '2026-07-12 10:00:00'),
    rec('nvidia/llama-3.3-nemotron-super-49b-v1.5', 'success', 500, '2026-07-12 11:00:00'),
    rec('z-ai/glm-5.2', 'success', 300, '2026-07-12 12:00:00'),
    rec('nvidia/nemotron-3-ultra-550b-a55b:free', 'success', 9999, '2026-07-12 12:30:00'), // free tier
    rec('glm-5.2', 'success', 200, '2026-07-12 13:00:00'), // subscription
    rec('nvidia/llama-3.3-nemotron-super-49b-v1.5', 'success', 700, '2026-07-11 10:00:00'), // other day
  ].join('\n'));
  const c = countPaidToday(records, '2026-07-12');
  assert.strictEqual(c.nim.calls, 2);
  assert.strictEqual(c.nim.tokens, 1500);
  assert.strictEqual(c['openrouter-paid'].calls, 1);
  assert.strictEqual(c['openrouter-paid'].tokens, 300);
}

// countGlmWindow: subscription glm successes inside the window only
{
  const now = Date.parse('2026-07-12T12:00:00');
  const records = parseLines([
    rec('glm-5.2', 'success', 100, '2026-07-12 11:00:00'),      // in window
    rec('glm-5.2', 'failure', 0, '2026-07-12 11:30:00'),        // failure — not a served prompt
    rec('z-ai/glm-5.2', 'success', 100, '2026-07-12 11:45:00'), // per-token, not subscription
    rec('glm-5.2', 'success', 100, '2026-07-12 06:00:00'),      // outside 5h window
    rec('qwen3:8b-64k', 'success', 100, '2026-07-12 11:50:00'),
  ].join('\n'));
  assert.strictEqual(countGlmWindow(records, now), 1);
}

// decideAlerts: paid-route alert fires per route, once per day, resets next day
{
  const paid = {
    nim: { calls: 200, tokens: 3_000_000, label: 'NVIDIA NIM nemotron-49b (per-token)' },
    'openrouter-paid': { calls: 5, tokens: 10_000, label: 'OpenRouter z-ai/glm (per-token)' },
  };
  const r1 = decideAlerts({ paid, glm5h: 0, state: {}, dayStr: '2026-07-12', paidCap: 150, glmWarn: 120 });
  assert.strictEqual(r1.alerts.length, 1, 'only the route over cap alerts');
  assert.match(r1.alerts[0].body, /NIM/);
  assert.strictEqual(r1.alerts[0].priority, 'urgent');
  const r2 = decideAlerts({ paid, glm5h: 0, state: r1.next, dayStr: '2026-07-12', paidCap: 150, glmWarn: 120 });
  assert.strictEqual(r2.alerts.length, 0, 'no re-alert same day');
  const r3 = decideAlerts({ paid, glm5h: 0, state: r1.next, dayStr: '2026-07-13', paidCap: 150, glmWarn: 120 });
  assert.strictEqual(r3.alerts.length, 1, 'alerts again on a new day');
}

// decideAlerts: both routes over cap alert independently
{
  const paid = {
    nim: { calls: 200, tokens: 0, label: 'NVIDIA NIM nemotron-49b (per-token)' },
    'openrouter-paid': { calls: 400, tokens: 0, label: 'OpenRouter z-ai/glm (per-token)' },
  };
  const r = decideAlerts({ paid, glm5h: 0, state: {}, dayStr: '2026-07-12', paidCap: 150, glmWarn: 120 });
  assert.strictEqual(r.alerts.length, 2);
}

// decideAlerts: GLM 5h pace warning, once per day
{
  const paid = { nim: { calls: 0, tokens: 0, label: 'x' } };
  const r1 = decideAlerts({ paid, glm5h: 150, state: {}, dayStr: '2026-07-12', paidCap: 150, glmWarn: 120 });
  assert.strictEqual(r1.alerts.length, 1);
  assert.match(r1.alerts[0].title, /5h-window/);
  const r2 = decideAlerts({ paid, glm5h: 180, state: r1.next, dayStr: '2026-07-12', paidCap: 150, glmWarn: 120 });
  assert.strictEqual(r2.alerts.length, 0, 'GLM pace alert latches for the day');
}

// quiet when everything is under thresholds
{
  const paid = {
    nim: { calls: 3, tokens: 40_000, label: 'x' },
    'openrouter-paid': { calls: 0, tokens: 0, label: 'y' },
  };
  const r = decideAlerts({ paid, glm5h: 10, state: {}, dayStr: '2026-07-12', paidCap: 150, glmWarn: 120 });
  assert.strictEqual(r.alerts.length, 0);
}

// parseLines tolerates garbage
{
  assert.strictEqual(parseLines('not json\n{broken\n' + rec('glm-5.2', 'success', 1, '2026-07-12 01:00:00')).length, 1);
}

console.log('=== All paid-route-watch tests passed! ===');
