#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const testRevenueDir = fs.mkdtempSync(path.join(os.tmpdir(), 'revenue-loop-test-'));
process.env.REVENUE_DIR = testRevenueDir;

const {
  stageSummary,
  dueFollowUps,
  hoursSince,
  buildFollowupEmail,
  offerLinkFromMap,
  parseArgs,
  contactForProspect,
  githubUrlFromNotes,
  sendLedgerKey,
  acquireSendReservation,
} = require('../tools/revenue-autonomous-loop');

let n = 0;
function check(label, fn) {
  fn();
  n += 1;
  console.log(`  ok - ${label}`);
}

check('parseArgs defaults', () => {
  const a = parseArgs([]);
  assert.strictEqual(a.chrome, true);
  assert.strictEqual(a.ntfy, true);
  assert.strictEqual(a.fast, false);
});

check('parseArgs --fast disables chrome/apollo', () => {
  const a = parseArgs(['--fast']);
  assert.strictEqual(a.fast, true);
  assert.strictEqual(a.chrome, false);
  assert.strictEqual(a.apollo, false);
});

check('unattended-send approval is explicit', () => {
  const a = parseArgs(['--auto-send', '--allow-unattended-send']);
  assert.strictEqual(a.autoSend, true);
  assert.strictEqual(a.allowUnattendedSend, true);
});

check('send ledger keys dedupe recipient-template pairs per day', () => {
  const first = sendLedgerKey({
    day: '2026-07-19',
    to: 'Founder@Example.com',
    template: 'revenue-autonomous-followup-v1',
  });
  const same = sendLedgerKey({
    day: '2026-07-19',
    to: 'founder@example.com',
    template: 'revenue-autonomous-followup-v1',
  });
  const nextDay = sendLedgerKey({
    day: '2026-07-20',
    to: 'founder@example.com',
    template: 'revenue-autonomous-followup-v1',
  });
  assert.strictEqual(first, same);
  assert.notStrictEqual(first, nextDay);
});

check('send ledger reserves a contact-template only once per day', () => {
  const first = acquireSendReservation({
    to: 'founder@example.com',
    template: 'revenue-autonomous-followup-v1',
    prospect: 'example',
  });
  const duplicate = acquireSendReservation({
    to: 'FOUNDER@example.com',
    template: 'revenue-autonomous-followup-v1',
    prospect: 'example',
  });
  assert.strictEqual(first.ok, true);
  assert.strictEqual(duplicate.ok, false);
  assert.strictEqual(duplicate.reason, 'already_reserved_or_sent_today');
});

check('stageSummary open gross ignores paid/lost', () => {
  const s = stageSummary([
    { stage: 'sent', gross_potential_usd: '100' },
    { stage: 'paid', gross_potential_usd: '999' },
    { stage: 'lost', gross_potential_usd: '50' },
    { stage: 'ready', gross_potential_usd: '25' },
  ]);
  assert.strictEqual(s.openGross, 125);
  assert.strictEqual(s.counts.sent, 1);
});

check('dueFollowUps respects hours', () => {
  const old = '2020-01-01';
  const rows = [
    { stage: 'sent', last_touch: old, next_action: 'wait_for_reply', prospect_label: 'a' },
    { stage: 'sent', last_touch: new Date().toISOString().slice(0, 10), next_action: 'wait_for_reply', prospect_label: 'b' },
    { stage: 'ready', last_touch: old, next_action: 'send', prospect_label: 'c' },
  ];
  const due = dueFollowUps(rows, 48);
  assert.strictEqual(due.length, 1);
  assert.strictEqual(due[0].prospect_label, 'a');
});

check('hoursSince finite for ISO date', () => {
  assert.ok(hoursSince('2026-01-01') > 0);
});

check('buildFollowupEmail includes live link only when http 200', () => {
  const withLink = buildFollowupEmail(
    { prospect_label: 'acme', route: 'Agent Reliability Diagnostic ($499)' },
    { email: 'a@b.com', person: 'Ann' },
    { url: 'https://buy.stripe.com/x', http: 200 },
  );
  assert.match(withLink.body, /buy\.stripe\.com\/x/);
  const noLink = buildFollowupEmail(
    { prospect_label: 'acme', route: 'Agent Reliability Diagnostic ($499)' },
    { email: 'a@b.com', person: 'Ann' },
    { url: 'https://buy.stripe.com/x', http: 403 },
  );
  assert.doesNotMatch(noLink.body, /buy\.stripe\.com\/x/);
});

check('offerLinkFromMap picks pilot', () => {
  const row = offerLinkFromMap(
    [
      { offer: 'Partner Pilot', payment_link_url: 'https://buy.stripe.com/p' },
      { offer: 'Agent Reliability Diagnostic', payment_link_url: 'https://buy.stripe.com/d' },
    ],
    'Partner Pilot ($3,000)',
  );
  assert.strictEqual(row.payment_link_url, 'https://buy.stripe.com/p');
});

check('contactForProspect matches label', () => {
  const c = contactForProspect(
    { 'a@b.com': { email: 'a@b.com', prospect: 'eltmon' } },
    { prospect_label: 'eltmon', notes: '' },
  );
  assert.strictEqual(c.email, 'a@b.com');
});

check('githubUrlFromNotes extracts issue URL', () => {
  const u = githubUrlFromNotes(
    'watch https://github.com/foo/bar/issues/12#issuecomment-1 more',
  );
  assert.ok(u.includes('github.com/foo/bar/issues/12'));
});

console.log(`\nPASS ${n}/${n} revenue-autonomous-loop`);
fs.rmSync(testRevenueDir, { recursive: true, force: true });
