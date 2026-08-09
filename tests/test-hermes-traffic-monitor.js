'use strict';

/**
 * Tests for tools/hermes-traffic-monitor.js.
 *
 * The load-bearing case is the empty-response rule. Before 2026-08-05 the monitor
 * counted ANY blank response as empty, including failures — which have no body by
 * definition. On the live log every row then read identically (337/337, 233/233,
 * 154/154): the empty column was a copy of the failure column and carried zero
 * signal. The metric that matters is the SILENT one — status=success and still no
 * usable text. That is the GLM_MIN_MAX_TOKENS class of bug: reasoning tokens consume
 * the whole budget, HTTP 200 returns with empty content, and failure-based monitoring
 * never sees it. 67 such calls exist in the live log.
 *
 * Fixtures are synthetic so this stays hermetic and fast — the real log is 1.4GB.
 */

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  isEmptyResponse,
  aggregate,
  detectDegraded,
  buildReport,
  percentile,
} = require('../tools/hermes-traffic-monitor.js');

// --- empty classification -------------------------------------------------
// A blank response WITH tool calls is a normal tool-calling turn, not a dud.
// Counting those swamps the signal: 10 of 13 blank responses in one live sample
// were tool_call turns.
assert.strictEqual(
  isEmptyResponse({ response: '', has_tool_calls: true, empty_kind: 'tool_call' }),
  false,
  'tool_call turns must not count as empty',
);
assert.strictEqual(isEmptyResponse({ response: '', has_tool_calls: false, empty_kind: 'empty' }), true);
assert.strictEqual(isEmptyResponse({ response: null, has_tool_calls: false, empty_kind: 'truncated' }), true);
assert.strictEqual(isEmptyResponse({ response: 'hello', has_tool_calls: false, empty_kind: null }), false);

// --- percentile is inclusive and ordered ---------------------------------
assert.strictEqual(percentile([1, 2, 3, 4], 0), 1);
assert.strictEqual(percentile([], 0.5), null);

// --- REGRESSION: failures must not inflate the empty count ---------------
// 20 failures (blank bodies, as failures always are) + 5 successes that returned
// text. Correct output: 20 failures, 0 empties. The pre-fix code reported 20/20.
{
  const records = [];
  for (let i = 0; i < 20; i += 1) {
    records.push({
      model: 'dead-route', status: 'failure', response: null, has_tool_calls: false,
      prompt_tokens: 0, completion_tokens: 0, latency_s: 0.02,
    });
  }
  for (let i = 0; i < 5; i += 1) {
    records.push({
      model: 'dead-route', status: 'success', response: 'ok', has_tool_calls: false,
      prompt_tokens: 100, completion_tokens: 10, latency_s: 1,
    });
  }
  const normalized = records.map((r) => ({
    model: r.model,
    isFailure: r.status === 'failure',
    isSuccess: r.status === 'success',
    isEmpty: isEmptyResponse(r),
    latency: r.latency_s,
    promptTokens: r.prompt_tokens,
    completionTokens: r.completion_tokens,
  }));
  const summary = aggregate(normalized);
  const dead = summary.models.find((m) => m.model === 'dead-route');
  assert.ok(dead, 'dead-route must appear');
  assert.strictEqual(dead.failures, 20, 'failures counted');
  assert.strictEqual(
    dead.emptyResponses, 0,
    'FAILURES MUST NOT COUNT AS EMPTY — a failure has no body, so counting it made '
    + 'emptyResponses a duplicate of failures (337/337 on the live log)',
  );
}

// --- the silent case IS caught: success + blank + no tool calls -----------
{
  const records = [];
  for (let i = 0; i < 20; i += 1) {
    records.push({
      model: 'silent-route', status: 'success', response: '', has_tool_calls: false,
      empty_kind: 'empty', prompt_tokens: 500, completion_tokens: 0, latency_s: 2,
    });
  }
  const normalized = records.map((r) => ({
    model: r.model,
    isFailure: false,
    isSuccess: true,
    isEmpty: isEmptyResponse(r),
    latency: r.latency_s,
    promptTokens: r.prompt_tokens,
    completionTokens: r.completion_tokens,
  }));
  const summary = aggregate(normalized);
  const silent = summary.models.find((m) => m.model === 'silent-route');
  assert.strictEqual(silent.failures, 0, 'these all reported success');
  assert.strictEqual(
    silent.emptyResponses, 20,
    'succeeded-but-blank must be counted — this is the bug worth alerting on',
  );
  const degraded = detectDegraded(summary);
  assert.ok(
    degraded.some((d) => d.rule === 'high_empty_rate'),
    'a 100% succeeded-but-blank model must raise high_empty_rate',
  );
}

// --- missing log must not throw -------------------------------------------
{
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'traffic-monitor-'));
  const report = buildReport({ logPath: path.join(dir, 'nope.jsonl') });
  assert.ok(report, 'a missing log must produce a report, not throw');
  fs.rmSync(dir, { recursive: true, force: true });
}

console.log('Hermes traffic monitor tests: PASS');
