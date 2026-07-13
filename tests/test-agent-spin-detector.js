'use strict';

const assert = require('assert');
const path = require('path');

const { parseLines, toEvent, maxRepeatRun, detectSpin } =
  require(path.resolve(__dirname, '../tools/agent-spin-detector.js'));

console.log('=== Running agent-spin-detector tests ===\n');

const rec = (over = {}) => JSON.stringify(Object.assign({
  model: 'glm-5.2', status: 'success', total_tokens: 500,
  has_tool_calls: false, tools_offered: true, response: '', ts_end: '2026-07-09 20:00:00',
}, over));

// parseLines tolerates the partial writes of a live-appended log
{
  const lines = [rec(), 'not json', '{"truncated":'].join('\n');
  assert.strictEqual(parseLines(lines).length, 1);
}

// toEvent: tool calls are the state-change proxy; extra telemetry adds to it
{
  assert.strictEqual(toEvent({ has_tool_calls: true }).stateChanges, 1);
  assert.strictEqual(toEvent({ has_tool_calls: false }).stateChanges, 0);
  assert.strictEqual(toEvent({ tool_call_count: 2 }).stateChanges, 1);
  assert.strictEqual(toEvent({ has_tool_calls: true, files_changed: 2, commits: 1 }).stateChanges, 4);
}

// maxRepeatRun ignores empty responses (a tool call has no prose)
{
  const ev = (r) => ({ response: r, tokens: 0, stateChanges: 0 });
  assert.strictEqual(maxRepeatRun([ev(''), ev(''), ev('')]), 0);
  assert.strictEqual(maxRepeatRun([ev('a'), ev('a'), ev('b')]), 2);
  assert.strictEqual(maxRepeatRun([ev('a'), ev('b'), ev('a')]), 1);
}

const events = (n, over = {}) =>
  parseLines(Array.from({ length: n }, () => rec(over)).join('\n')).map(toEvent);

// SPINNING: burning tokens, zero state change. The whole point of the tool.
{
  const r = detectSpin(events(6, { total_tokens: 1000, has_tool_calls: false }));
  assert.strictEqual(r.verdict, 'spinning');
  assert.strictEqual(r.stateChanges, 0);
  assert.match(r.reason, /zero state changes/);
}

// PRODUCTIVE: same tokens, but it is changing things. Must NOT alert.
{
  const r = detectSpin(events(6, { total_tokens: 1000, has_tool_calls: true }));
  assert.strictEqual(r.verdict, 'productive');
}

// A single state change late in the window rescues it — we are not trigger-happy.
{
  const ev = events(6, { total_tokens: 1000, has_tool_calls: false });
  ev[5].stateChanges = 1;
  assert.strictEqual(detectSpin(ev).verdict, 'productive');
}

// IDLE is not SPINNING: low spend must not page anyone.
{
  const r = detectSpin(events(6, { total_tokens: 10, has_tool_calls: false }));
  assert.strictEqual(r.verdict, 'idle');
}

// LOOPING beats productive: an agent can repeat itself while still calling tools.
{
  const r = detectSpin(events(6, { total_tokens: 1000, has_tool_calls: true, response: 'again' }));
  assert.strictEqual(r.verdict, 'looping');
  assert.strictEqual(r.repeats, 6);
}

// Distinct responses are not a loop.
{
  const ev = events(6, { total_tokens: 1000, has_tool_calls: true });
  ev.forEach((e, i) => { e.response = `step ${i}`; });
  assert.strictEqual(detectSpin(ev).verdict, 'productive');
}

// Non-agentic traffic (vision, embeddings, plain chat) is NOT spinning. It offered
// no tools, so zero tool calls means nothing. This was a real 29%-false-positive
// bug found by backtesting against the live traffic log.
{
  const r = detectSpin(events(6, { total_tokens: 5000, has_tool_calls: false, tools_offered: false }));
  assert.strictEqual(r.verdict, 'unknown');
  assert.match(r.reason, /non-agentic calls ignored/);
}

// Mixed traffic: the 6 agentic spinning calls are judged; chat noise is ignored.
{
  const ev = [
    ...events(20, { total_tokens: 5000, has_tool_calls: false, tools_offered: false }),
    ...events(6, { total_tokens: 1000, has_tool_calls: false, tools_offered: true }),
  ];
  assert.strictEqual(detectSpin(ev).verdict, 'spinning');
}

// UNKNOWN, not "productive": too little evidence is not a clean bill of health.
{
  const r = detectSpin(events(2, { total_tokens: 1000, has_tool_calls: false }));
  assert.strictEqual(r.verdict, 'unknown');
}

// Only the window is considered: old productive work does not excuse spinning now.
{
  const ev = [...events(6, { total_tokens: 1000, has_tool_calls: true }),
              ...events(6, { total_tokens: 1000, has_tool_calls: false })];
  assert.strictEqual(detectSpin(ev).verdict, 'spinning');
}

// The 2026-07-07 regression: a degraded model emits tool-call JSON as PROSE.
// has_tool_calls is false, tokens flow, nothing changes => must read as spinning.
{
  const ev = events(6, {
    total_tokens: 1200,
    has_tool_calls: false,
    response: '{"name": "bash", "arguments": {"command": "ls"}}',
  });
  ev.forEach((e, i) => { e.response = `{"name":"bash","arguments":{"command":"ls -${i}"}}`; });
  const r = detectSpin(ev);
  assert.strictEqual(r.verdict, 'spinning');
}

console.log('All agent-spin-detector tests passed.');
