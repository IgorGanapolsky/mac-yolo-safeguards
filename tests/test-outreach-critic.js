'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { critiqueDraft } = require('../tools/outreach-critic');

const GOOD_BODY = [
  'Antor — found Golem today (self-hosted web UI over coding-agent CLIs).',
  'What worked for me running agents 24/7: task-scoped leases, a judge gate',
  'before destructive actions, and browser approvals with receipts. Notes are',
  'public at thumbgate.app/security if useful for Golem. Twenty minutes to',
  'swap approaches, no agenda: https://cal.com/igor-g-kvqxfo/30min',
  'Wrote this myself, no list. Reply "no" and I will not write again. — Igor',
].join(' ');

test('an honest personalized draft with opt-out and CTA is fully satisfactory', () => {
  const r = critiqueDraft({ subject: 'Golem + the approval-layer problem', body: GOOD_BODY, anchors: ['Golem'] });
  assert.equal(r.verdict, 'fully_satisfactory');
  assert.deepEqual(r.hard, []);
});

test('missing opt-out line is a hard failure', () => {
  const body = GOOD_BODY.replace(/Reply "no" and I will not write again\./, '');
  const r = critiqueDraft({ subject: 'Golem thoughts', body, anchors: ['Golem'] });
  assert.equal(r.verdict, 'not_satisfactory');
  assert.ok(r.hard.some((h) => h.includes('opt-out')));
});

test('invented customer counts are a hard failure (honesty covenant)', () => {
  const body = GOOD_BODY + ' Already 500 customers rely on it.';
  const r = critiqueDraft({ subject: 'Golem thoughts', body, anchors: ['Golem'] });
  assert.equal(r.verdict, 'not_satisfactory');
  assert.ok(r.hard.some((h) => h.includes('customer/user count')));
});

test('plus-suffixed and comma-grouped counts are hard failures too', () => {
  for (const claim of [' Already 500+ customers rely on it.', ' Join 1,000+ users today.']) {
    const r = critiqueDraft({ subject: 'Golem thoughts', body: GOOD_BODY + claim, anchors: ['Golem'] });
    assert.equal(r.verdict, 'not_satisfactory', claim);
  }
});

test('queue wiring: outreach-queue consults the critic before marking ready', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const queue = fs.readFileSync(path.join(__dirname, '../tools/outreach-queue.js'), 'utf8');
  assert.match(queue, /require\('\.\/outreach-critic'\)/);
  assert.match(queue, /blocked_by_critic/);
  assert.doesNotMatch(queue, /send_status:\s*'ready',/, 'send_status must be critic-gated, not unconditional');
});

test('certification claims are a hard failure', () => {
  const body = GOOD_BODY + ' We are SOC 2 certified.';
  const r = critiqueDraft({ subject: 'Golem thoughts', body, anchors: ['Golem'] });
  assert.equal(r.verdict, 'not_satisfactory');
});

test('missing personalization anchor is a hard failure', () => {
  const r = critiqueDraft({ subject: 'hello', body: GOOD_BODY, anchors: ['Kubernetes operator'] });
  assert.equal(r.verdict, 'not_satisfactory');
  assert.ok(r.hard.some((h) => h.includes('anchor')));
});

test('hype vocabulary downgrades to satisfactory_with_caveats, not a block', () => {
  const body = GOOD_BODY + ' It is a game-changing approach.';
  const r = critiqueDraft({ subject: 'Golem thoughts', body, anchors: ['Golem'] });
  assert.equal(r.verdict, 'satisfactory_with_caveats');
  assert.deepEqual(r.hard, []);
});

test('generic subject line is a caveat', () => {
  const r = critiqueDraft({ subject: 'Quick question', body: GOOD_BODY, anchors: ['Golem'] });
  assert.equal(r.verdict, 'satisfactory_with_caveats');
  assert.ok(r.caveats.some((c) => c.includes('generic subject')));
});

test('thin bodies are flagged as caveats', () => {
  const r = critiqueDraft({ subject: 'Golem', body: 'Hi, saw Golem. Call me: https://cal.com/x/30min Reply "no" to opt out.', anchors: ['Golem'] });
  assert.equal(r.verdict, 'satisfactory_with_caveats');
  assert.ok(r.caveats.some((c) => c.includes('under 350')));
});
