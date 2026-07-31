#!/usr/bin/env node
'use strict';

const assert = require('assert');
const {
  matchTopic,
  scoreIssue,
  dayCount,
  TOPIC_TEMPLATES,
  DISCLOSURE,
} = require('../tools/tml-tinker-engage-loop');

function test(name, fn) {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (e) {
    console.error(`not ok - ${name}`);
    console.error(e);
    process.exitCode = 1;
  }
}

test('cost topic matches pricing issues', () => {
  const t = matchTopic({ title: 'Expose per-run cost via API', body: 'billing balance credits' });
  assert.strictEqual(t.id, 'cost_api');
});

test('eval topic matches papers with code', () => {
  const t = matchTopic({ title: 'Verify evals on Papers with Code', body: 'MMLU scores' });
  assert.strictEqual(t.id, 'eval_repro');
});

test('disclosure always present in templates', () => {
  for (const t of TOPIC_TEMPLATES) {
    const body = t.body({ number: 1, title: 'x' });
    assert.ok(body.includes('ThumbGate.app'), t.id);
    assert.ok(body.includes('No affiliation') || body.includes('Independent'), t.id);
    assert.ok(DISCLOSURE.includes('thinking-machines') || DISCLOSURE.includes('Thinking Machines'));
  }
});

test('score demotes already commented issues', () => {
  const issue = {
    number: 99,
    title: 'Account balance API',
    body: 'usage credits spend',
    comments: 0,
    updatedAt: new Date().toISOString(),
    author: { login: 'other' },
  };
  const ledger = [{ action: 'comment', issue: 99, ts: new Date().toISOString() }];
  const a = scoreIssue(issue, 'IgorGanapolsky', []);
  const b = scoreIssue(issue, 'IgorGanapolsky', ledger);
  assert.ok(a.score > 20);
  assert.ok(b.score < 0);
});

test('dayCount counts only comment actions for day', () => {
  const ledger = [
    { action: 'comment', ts: '2026-07-31T10:00:00Z' },
    { action: 'comment', ts: '2026-07-31T12:00:00Z' },
    { action: 'comment_dry_run', ts: '2026-07-31T13:00:00Z' },
    { action: 'comment', ts: '2026-07-30T10:00:00Z' },
  ];
  assert.strictEqual(dayCount(ledger, '2026-07-31'), 2);
});

test('self-authored issues are ineligible', () => {
  const issue = {
    number: 847,
    title: 'Recipe idea cost balance',
    body: 'usage credits',
    comments: 0,
    updatedAt: new Date().toISOString(),
    author: { login: 'IgorGanapolsky' },
  };
  const r = scoreIssue(issue, 'IgorGanapolsky', []);
  assert.ok(r.score < 0);
  assert.strictEqual(r.ineligible, 'self_authored');
});

if (process.exitCode) process.exit(process.exitCode);
console.log('All tml-tinker-engage-loop tests passed.');
