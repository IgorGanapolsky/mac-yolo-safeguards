#!/usr/bin/env node
// Tests for agent-efficiency-board.js: phase classification, aggregation, no invented data.
'use strict';

const assert = require('assert');
const { classifyMessage, analyze } = require('../tools/agent-efficiency-board.js');
const fs = require('fs');
const os = require('os');
const path = require('path');

let pass = 0, fail = 0;
function ok(name) { console.log(`  [PASS] ${name}`); pass++; }
function no(name, detail) { console.log(`  [FAIL] ${name}${detail ? ' — ' + detail : ''}`); fail++; }

function t(name, fn) {
  try { fn(); ok(name); } catch (e) { no(name, e.message); }
}

t('classifyMessage: tool_use Read -> explore', () => {
  assert.strictEqual(classifyMessage([{ type: 'tool_use', name: 'Read' }]), 'explore');
});
t('classifyMessage: tool_use Edit -> edit (takes priority over explore)', () => {
  assert.strictEqual(classifyMessage([{ type: 'tool_use', name: 'Read' }, { type: 'tool_use', name: 'Edit' }]), 'edit');
});
t('classifyMessage: tool_use Bash -> run', () => {
  assert.strictEqual(classifyMessage([{ type: 'tool_use', name: 'Bash' }]), 'run');
});
t('classifyMessage: tool_use Agent -> delegate (highest priority)', () => {
  assert.strictEqual(classifyMessage([{ type: 'tool_use', name: 'Edit' }, { type: 'tool_use', name: 'Agent' }]), 'delegate');
});
t('classifyMessage: thinking only -> think', () => {
  assert.strictEqual(classifyMessage([{ type: 'thinking', thinking: 'hmm' }]), 'think');
});
t('classifyMessage: empty/unknown -> other', () => {
  assert.strictEqual(classifyMessage([]), 'other');
  assert.strictEqual(classifyMessage(null), 'other');
});

t('analyze: sums real usage tokens, does not invent data for empty usage', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'aeb-test-'));
  const file = path.join(tmp, 'session.jsonl');
  const rows = [
    { type: 'assistant', sessionId: 's1', timestamp: '2026-07-24T10:00:00Z',
      message: { usage: { input_tokens: 100, output_tokens: 50, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
        content: [{ type: 'tool_use', name: 'Read' }] } },
    { type: 'assistant', sessionId: 's1', timestamp: '2026-07-24T10:01:00Z',
      message: { usage: { input_tokens: 200, output_tokens: 20, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
        content: [{ type: 'tool_use', name: 'Edit', input: { file_path: '/tmp/x.js' } }] } },
    { type: 'user', sessionId: 's1', timestamp: '2026-07-24T10:02:00Z', message: {} },
    { type: 'assistant', sessionId: 's1', timestamp: '2026-07-24T10:03:00Z',
      message: { usage: {}, content: [{ type: 'text', text: 'no usage here, should not count' }] } },
  ];
  fs.writeFileSync(file, rows.map((r) => JSON.stringify(r)).join('\n') + '\n');

  const stats = analyze([file], null);
  assert.strictEqual(stats.phaseTokens.explore, 150, 'explore tokens');
  assert.strictEqual(stats.phaseTokens.edit, 220, 'edit tokens');
  assert.strictEqual(stats.totalMessages, 2, 'only counts messages with nonzero usage');
  assert.strictEqual(stats.editedFileCount, 1, 'tracks unique edited file');
  assert.strictEqual(stats.sessionCount, 1);

  fs.rmSync(tmp, { recursive: true, force: true });
});

t('analyze: --days cutoff excludes older rows', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'aeb-test-'));
  const file = path.join(tmp, 'session.jsonl');
  const oldTs = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const newTs = new Date().toISOString();
  const rows = [
    { type: 'assistant', sessionId: 's1', timestamp: oldTs,
      message: { usage: { input_tokens: 999, output_tokens: 0 }, content: [{ type: 'tool_use', name: 'Bash' }] } },
    { type: 'assistant', sessionId: 's1', timestamp: newTs,
      message: { usage: { input_tokens: 10, output_tokens: 0 }, content: [{ type: 'tool_use', name: 'Bash' }] } },
  ];
  fs.writeFileSync(file, rows.map((r) => JSON.stringify(r)).join('\n') + '\n');

  const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const stats = analyze([file], cutoff);
  assert.strictEqual(stats.phaseTokens.run, 10, 'excludes the 30-day-old row');

  fs.rmSync(tmp, { recursive: true, force: true });
});

console.log(`agent-efficiency-board tests: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
