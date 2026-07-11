'use strict';

const assert = require('assert');
const path = require('path');

const { parseLines, summarizeDay, detectDegraded, detectTruncated, decideAlerts } =
  require(path.resolve(__dirname, '../tools/hermes-burn-alert.js'));

console.log('=== Running hermes-burn-alert tests ===\n');

const rec = (model, status, tokens, ts) =>
  JSON.stringify({ model, status, total_tokens: tokens, ts_end: ts });

// parseLines tolerates garbage
{
  const lines = [rec('glm-5.2', 'success', 100, '2026-07-07 10:00:00'), 'not json', '{broken'].join('\n');
  assert.strictEqual(parseLines(lines).length, 1);
}

// summarizeDay: only counts the requested day, aggregates by model
{
  const records = parseLines([
    rec('glm-5.2', 'success', 1000, '2026-07-07 09:00:00'),
    rec('glm-5.2', 'success', 500, '2026-07-07 10:00:00'),
    rec('qwen3:8b-64k', 'success', 200, '2026-07-07 11:00:00'),
    rec('glm-5.2', 'success', 9999, '2026-07-06 10:00:00'), // other day
  ].join('\n'));
  const s = summarizeDay(records, '2026-07-07');
  assert.strictEqual(s.totalTokens, 1700);
  assert.strictEqual(s.byModel['glm-5.2'], 1500);
  assert.strictEqual(s.byModel['qwen3:8b-64k'], 200);
}

// detectDegraded mirrors the wrapper heuristic
{
  const fail = (ts) => rec('glm-5.2', 'failure', 0, ts);
  const ok = (ts) => rec('z-ai/glm-5.2', 'success', 100, ts);
  assert.strictEqual(detectDegraded(parseLines([fail(1), fail(2), fail(3)].join('\n'))), true);
  assert.strictEqual(detectDegraded(parseLines([fail(1), fail(2), fail(3), ok(4)].join('\n'))), false);
  assert.strictEqual(detectDegraded(parseLines([ok(1), fail(2), fail(3), fail(4)].join('\n'))), true);
  assert.strictEqual(detectDegraded(parseLines([fail(1), fail(2)].join('\n'))), false);
}

// decideAlerts: burn fires once per day
{
  const summary = { totalTokens: 9_000_000, byModel: { 'glm-5.2': 9_000_000 } };
  const r1 = decideAlerts({ summary, degraded: false, state: {}, now: 1000, dayStr: '2026-07-07', cap: 8_000_000 });
  assert.strictEqual(r1.alerts.length, 1);
  assert.match(r1.alerts[0].title, /burn/i);
  const r2 = decideAlerts({ summary, degraded: false, state: r1.next, now: 2000, dayStr: '2026-07-07', cap: 8_000_000 });
  assert.strictEqual(r2.alerts.length, 0, 'burn must not re-alert same day');
  const r3 = decideAlerts({ summary, degraded: false, state: r1.next, now: 3000, dayStr: '2026-07-08', cap: 8_000_000 });
  assert.strictEqual(r3.alerts.length, 1, 'burn alerts again on a new day');
}

// decideAlerts: degraded re-alerts only after the cooldown, clears on recovery
{
  const summary = { totalTokens: 0, byModel: {} };
  const base = { summary, dayStr: '2026-07-07', cap: 8_000_000, degradedRealertMs: 1000 };
  const r1 = decideAlerts({ ...base, degraded: true, state: {}, now: 10_000 });
  assert.strictEqual(r1.alerts.length, 1);
  assert.match(r1.alerts[0].title, /DEGRADED/);
  const r2 = decideAlerts({ ...base, degraded: true, state: r1.next, now: 10_500 });
  assert.strictEqual(r2.alerts.length, 0, 'inside cooldown: no re-alert');
  const r3 = decideAlerts({ ...base, degraded: true, state: r1.next, now: 11_500 });
  assert.strictEqual(r3.alerts.length, 1, 'after cooldown: re-alert');
  const r4 = decideAlerts({ ...base, degraded: false, state: r3.next, now: 12_000 });
  assert.strictEqual(r4.alerts.length, 0);
  assert.strictEqual(r4.next.degradedAlertedAt, null, 'recovery clears the degraded latch');
}

// no alerts under cap and healthy
{
  const r = decideAlerts({
    summary: { totalTokens: 1_000_000, byModel: {} }, degraded: false,
    state: {}, now: 1, dayStr: '2026-07-07', cap: 8_000_000,
  });
  assert.strictEqual(r.alerts.length, 0);
}

// detectTruncated: fires only when truncated empties dominate a sufficient GLM window
{
  const glm = (kind, i) => JSON.stringify({ model: 'glm-5.2', status: 'success', empty_kind: kind, ts_end: `t${i}` });
  const healthy = parseLines(Array.from({ length: 12 }, (_, i) =>
    glm(i % 3 === 0 ? 'tool_call' : null, i)).join('\n'));
  assert.strictEqual(detectTruncated(healthy).hit, false, 'tool_calls/answers must not trip the guard');
  const regressed = parseLines(Array.from({ length: 12 }, (_, i) =>
    glm(i < 4 ? 'truncated' : null, i)).join('\n'));
  const t = detectTruncated(regressed);
  assert.strictEqual(t.hit, true, 'truncated empties above the rate must trip the guard');
  assert.strictEqual(t.truncated, 4);
  assert.strictEqual(detectTruncated(parseLines([glm('truncated', 1), glm('truncated', 2)].join('\n'))).hit, false);
}

// decideAlerts: truncated guard alerts, latches on the cooldown, clears on recovery
{
  const summary = { totalTokens: 0, byModel: {} };
  const base = { summary, degraded: false, dayStr: '2026-07-08', cap: 8_000_000, degradedRealertMs: 1000 };
  const hit = { truncated: 5, sample: 12, hit: true };
  const r1 = decideAlerts({ ...base, truncated: hit, state: {}, now: 10_000 });
  assert.strictEqual(r1.alerts.length, 1);
  assert.match(r1.alerts[0].title, /truncation/i);
  const r2 = decideAlerts({ ...base, truncated: hit, state: r1.next, now: 10_500 });
  assert.strictEqual(r2.alerts.length, 0, 'inside cooldown: no re-alert');
  const r3 = decideAlerts({ ...base, truncated: { truncated: 0, sample: 12, hit: false }, state: r1.next, now: 12_000 });
  assert.strictEqual(r3.alerts.length, 0);
  assert.strictEqual(r3.next.truncatedAlertedAt, null, 'recovery clears the truncated latch');
}

// backward compat: decideAlerts without a truncated arg still works (existing callers)
{
  const r = decideAlerts({
    summary: { totalTokens: 1_000_000, byModel: {} }, degraded: false,
    state: {}, now: 1, dayStr: '2026-07-08', cap: 8_000_000,
  });
  assert.strictEqual(r.alerts.length, 0);
}

console.log('=== All burn-alert tests passed! ===');
