'use strict';

// Coverage for the bounded-window session reader added when /api/sessions hung.
// The risky part is NOT "does it find a title" — it is that a windowed read slices
// a JSON line in half at BOTH buffer boundaries. A half-line that silently
// JSON.parse-fails is indistinguishable from a session with no data, which is the
// same absence-as-evidence failure that made the reply scanner report "0 replies"
// for three days. Every case here is a way that could go wrong quietly.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { parseSessionMeta, readWindow, META_HEAD_BYTES, META_TAIL_BYTES } =
  require('../tools/hermes-dashboard.js');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dash-meta-'));
const write = (name, lines) => {
  const p = path.join(dir, name);
  fs.writeFileSync(p, lines.map((l) => (typeof l === 'string' ? l : JSON.stringify(l))).join('\n'));
  return p;
};
const userMsg = (text, ts, extra = {}) => ({
  type: 'user', timestamp: ts, message: { content: text }, ...extra,
});
const asstMsg = (text, ts) => ({ type: 'assistant', timestamp: ts, message: { content: text } });

test('small file: title, project, branch and both timestamps', () => {
  const f = write('small.jsonl', [
    userMsg('build the thing', '2026-07-01T00:00:00Z', { cwd: '/x/y/myproject', gitBranch: 'feat/a' }),
    asstMsg('ok', '2026-07-01T00:05:00Z'),
    userMsg('more', '2026-07-01T00:09:00Z'),
  ]);
  const m = parseSessionMeta(f);
  assert.equal(m.title, 'build the thing');
  assert.equal(m.project, 'myproject');
  assert.equal(m.branch, 'feat/a');
  assert.equal(m.firstTs, '2026-07-01T00:00:00Z');
  assert.equal(m.lastTs, '2026-07-01T00:09:00Z');
});

test('an ai-title overrides the first user message', () => {
  const f = write('ai.jsonl', [
    { type: 'ai-title', title: 'Generated Title' },
    userMsg('raw first message', '2026-07-01T00:00:00Z'),
  ]);
  assert.equal(parseSessionMeta(f).title, 'Generated Title');
});

test('tool-noise first turns do not become the title', () => {
  const f = write('noise.jsonl', [
    userMsg('<system-reminder>ignore me</system-reminder>', '2026-07-01T00:00:00Z'),
    userMsg('the real ask', '2026-07-01T00:01:00Z'),
  ]);
  assert.equal(parseSessionMeta(f).title, 'the real ask');
});

// THE case this window exists for. A file larger than head+tail must still yield a
// title from the head and the LAST timestamp from the tail — proving the tail is
// actually read rather than the head silently standing in for the whole file.
test('large file: title from head, lastTs from tail, middle skipped', () => {
  const filler = { type: 'assistant', timestamp: '2026-07-05T00:00:00Z', message: { content: 'x'.repeat(4000) } };
  const lines = [userMsg('first ask', '2026-07-01T00:00:00Z', { cwd: '/a/bigproj', gitBranch: 'main' })];
  const needed = Math.ceil((META_HEAD_BYTES + META_TAIL_BYTES) / 4000) + 40;
  for (let i = 0; i < needed; i += 1) lines.push(filler);
  lines.push(asstMsg('final answer', '2026-07-09T23:59:00Z'));
  const f = write('big.jsonl', lines);

  assert.ok(fs.statSync(f).size > META_HEAD_BYTES + META_TAIL_BYTES, 'fixture must exceed the window');
  const m = parseSessionMeta(f);
  assert.equal(m.title, 'first ask', 'head must still yield the title');
  assert.equal(m.firstTs, '2026-07-01T00:00:00Z');
  assert.equal(m.lastTs, '2026-07-09T23:59:00Z', 'tail must be read, not inferred from the head');
});

// A window boundary lands mid-line by construction. Mutation-testing showed the
// explicit shift()/pop() is NOT independently observable — a sliced line simply
// fails JSON.parse and hits the existing catch, so removing the guard changes
// nothing detectable. It stays as defence in depth, but this test only asserts
// what it can actually prove: a boundary landing mid-record must not corrupt the
// title or the last timestamp.
test('a mid-record window boundary does not corrupt title or lastTs', () => {
  const big = { type: 'assistant', timestamp: '2026-07-05T00:00:00Z', message: { content: 'y'.repeat(9999) } };
  const lines = [userMsg('good title', '2026-07-01T00:00:00Z')];
  const needed = Math.ceil((META_HEAD_BYTES + META_TAIL_BYTES) / 10000) + 20;
  for (let i = 0; i < needed; i += 1) lines.push(big);
  lines.push(asstMsg('tail answer', '2026-07-08T00:00:00Z'));
  const f = write('boundary.jsonl', lines);

  const m = parseSessionMeta(f);
  assert.equal(m.title, 'good title');
  assert.equal(m.lastTs, '2026-07-08T00:00:00Z');
  assert.ok(!/yyyy/.test(m.title), 'filler content must never leak into the title');
});

test('malformed lines are skipped without throwing', () => {
  const f = write('bad.jsonl', [
    '{not json at all',
    '',
    JSON.stringify(userMsg('survivor', '2026-07-02T00:00:00Z')),
    '{"type":"user","message":',
  ]);
  const m = parseSessionMeta(f);
  assert.equal(m.title, 'survivor');
  assert.equal(m.lastTs, '2026-07-02T00:00:00Z');
});

test('a session with no user/assistant turns is untitled, not a crash', () => {
  const f = write('empty.jsonl', [{ type: 'summary', text: 'nothing' }]);
  const m = parseSessionMeta(f);
  assert.equal(m.title, '(untitled)');
  assert.equal(m.firstTs, '');
});

test('a missing file returns null rather than throwing', () => {
  assert.equal(parseSessionMeta(path.join(dir, 'does-not-exist.jsonl')), null);
  assert.equal(readWindow(path.join(dir, 'nope.jsonl'), 10, 10), null);
});

test('readWindow does not double-read a file smaller than the window', () => {
  const f = write('tiny.jsonl', [userMsg('hi', '2026-07-01T00:00:00Z')]);
  const w = readWindow(f, META_HEAD_BYTES, META_TAIL_BYTES);
  assert.equal(w.truncated, false, 'small files must not be treated as windowed');
  assert.equal(w.tail, '', 'no tail read when the whole file fits in the head');
});

test('bytes and id are reported for the list view', () => {
  const f = write('meta.jsonl', [userMsg('sized', '2026-07-01T00:00:00Z')]);
  const m = parseSessionMeta(f);
  assert.equal(m.id, 'meta');
  assert.equal(m.bytes, fs.statSync(f).size);
});

process.on('exit', () => { try { fs.rmSync(dir, { recursive: true, force: true }); } catch {} });
