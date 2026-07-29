'use strict';

// Each case here corresponds to a mistake the first version of this tool actually
// made against real fleet data on 2026-07-28, or to a rule carried over from the
// eval-suite cleanup (never report a rate you cannot measure).

const test = require('node:test');
const assert = require('node:assert/strict');
const { summarizeRouteQuality } = require('../tools/route-quality-report');

const row = (over = {}) => ({
  model: 'm1',
  status: 'success',
  empty_kind: 'None',
  tools_offered: true,
  has_tool_calls: true,
  latency_s: 1,
  ...over,
});
const find = (res, m) => res.routes.find((r) => r.model === m);

test('empty_kind is a classification, not a boolean — tool_call is not empty', () => {
  // The first version counted ANY truthy empty_kind as an empty response, which
  // scored successful tool calls as failures and reported nemotron at 40% when
  // it was really 94%.
  const res = summarizeRouteQuality([
    row({ empty_kind: 'tool_call' }),
    row({ empty_kind: 'tool_call' }),
    row({ empty_kind: 'truncated' }),
    row({ empty_kind: 'empty', status: 'failure', has_tool_calls: false }),
  ]);
  assert.equal(find(res, 'm1').emptyRatePct, 25); // exactly one 'empty' of four
});

test('tool compliance is measured against ANSWERED requests, not all offered', () => {
  // 5 answered-with-tools, 20 never answered. Naive ratio = 20%; truth = 100%.
  const rows = [
    ...Array.from({ length: 5 }, () => row()),
    ...Array.from({ length: 20 }, () =>
      row({ status: 'failure', empty_kind: 'empty', has_tool_calls: false }),
    ),
  ];
  const r = find(summarizeRouteQuality(rows), 'm1');
  assert.equal(r.toolCompliancePct, 100);
  assert.equal(r.toolAnswered, 5);
  assert.equal(r.answerRatePct, 20);
});

test('a route that never answers is DEAD, not incapable', () => {
  // These need opposite fixes: refill/reroute vs stop using the model for agentic
  // work. Collapsing them into one 0% number hides which.
  const rows = Array.from({ length: 30 }, () =>
    row({ status: 'failure', empty_kind: 'empty', has_tool_calls: false }),
  );
  const r = find(summarizeRouteQuality(rows), 'm1');
  assert.equal(r.deadRoute, true);
  assert.equal(r.toolCompliancePct, null, 'must not report a compliance rate it cannot measure');
  assert.equal(r.answerRatePct, 0);
  assert.equal(summarizeRouteQuality(rows).dead.length, 1);
});

test('answers-but-ignores-tools is degraded, and is NOT reported as dead', () => {
  const rows = Array.from({ length: 20 }, () => row({ has_tool_calls: false }));
  const res = summarizeRouteQuality(rows);
  const r = find(res, 'm1');
  assert.equal(r.toolCompliancePct, 0);
  assert.equal(r.deadRoute, false);
  assert.equal(res.degraded.length, 1);
  assert.equal(res.dead.length, 0);
});

test('a rate is never reported on too small a sample', () => {
  const r = find(summarizeRouteQuality([row(), row()]), 'm1');
  assert.equal(r.toolCompliancePct, null);
  assert.equal(r.toolComplianceMeasured, false);
  assert.match(r.toolComplianceReason, /need >= 5/);
  // and an unmeasurable route is never counted as a finding
  assert.equal(summarizeRouteQuality([row({ has_tool_calls: false })]).degraded.length, 0);
});

test('requests that never offered tools cannot testify about tool use', () => {
  const rows = Array.from({ length: 20 }, () => row({ tools_offered: false, has_tool_calls: false }));
  const r = find(summarizeRouteQuality(rows), 'm1');
  assert.equal(r.toolOffered, 0);
  assert.equal(r.toolCompliancePct, null);
  assert.equal(r.deadRoute, false);
});

test('routes are separated per served model', () => {
  const res = summarizeRouteQuality([
    ...Array.from({ length: 6 }, () => row({ model: 'good' })),
    ...Array.from({ length: 6 }, () => row({ model: 'bad', has_tool_calls: false })),
  ]);
  assert.equal(find(res, 'good').toolCompliancePct, 100);
  assert.equal(find(res, 'bad').toolCompliancePct, 0);
  assert.equal(res.routes.length, 2);
});

test('malformed and model-less records are counted, not silently dropped', () => {
  const res = summarizeRouteQuality([row(), null, {}, { model: null }, 'nope']);
  assert.equal(res.malformed, 4);
  assert.equal(res.totalRecords, 5);
});

test('latency percentiles come from real values only', () => {
  const rows = [1, 2, 3, 4, 100].map((s) => row({ latency_s: s }));
  const r = find(summarizeRouteQuality(rows.concat(row({ latency_s: 'nonsense' }))), 'm1');
  assert.equal(r.latencyP50s, 3);
  assert.ok(r.latencyP95s >= 4);
});

// The traffic log is append-only and never pruned. Without a trailing window a
// model that accumulated never-answered tool calls stays in `dead` forever, so
// --gate exits 1 on every future run even after the route is rerouted or
// retired — the remediation the tool documents could not clear its own gate.
const DAY = 86400000;
const logTs = (ms) => new Date(ms).toISOString().replace('T', ' ').replace('Z', '');

test('a retired route stops failing the gate once it leaves the window', () => {
  const now = Date.UTC(2026, 6, 28, 12, 0, 0);
  const retired = Array.from({ length: 6 }, () =>
    row({ model: 'retired', ts_end: logTs(now - 30 * DAY), status: 'failure', has_tool_calls: false }),
  );
  const live = Array.from({ length: 6 }, () =>
    row({ model: 'live', ts_end: logTs(now - DAY) }),
  );
  const rows = retired.concat(live);

  const allTime = summarizeRouteQuality(rows, {});
  assert.deepEqual(allTime.dead.map((d) => d.model), ['retired'],
    'all-time aggregation must still see the historical dead route');

  const windowed = summarizeRouteQuality(rows, { sinceMs: now - 7 * DAY });
  assert.deepEqual(windowed.dead, [], 'a route outside the window must not fail the gate');
  assert.deepEqual(windowed.degraded, []);
  assert.equal(windowed.window.outsideWindow, 6);
});

test('a route that is dead INSIDE the window still fails the gate', () => {
  const now = Date.UTC(2026, 6, 28, 12, 0, 0);
  const rows = Array.from({ length: 6 }, () =>
    row({ model: 'broken-now', ts_end: logTs(now - 2 * DAY), status: 'failure', has_tool_calls: false }),
  );
  const windowed = summarizeRouteQuality(rows, { sinceMs: now - 7 * DAY });
  assert.deepEqual(windowed.dead.map((d) => d.model), ['broken-now'],
    'windowing must not become a way to hide a currently-dead route');
});

// Records with no usable timestamp are excluded from the window but COUNTED.
// Dropping them silently is how a gate starts passing for the wrong reason.
test('undated records are excluded from the window and reported, not hidden', () => {
  const now = Date.UTC(2026, 6, 28, 12, 0, 0);
  const rows = Array.from({ length: 6 }, () =>
    row({ model: 'no-ts', ts_end: undefined, status: 'failure', has_tool_calls: false }),
  );
  const windowed = summarizeRouteQuality(rows, { sinceMs: now - 7 * DAY });
  assert.equal(windowed.window.undated, 6);
  assert.equal(windowed.window.dated, 0);
  assert.deepEqual(windowed.dead, []);
});
