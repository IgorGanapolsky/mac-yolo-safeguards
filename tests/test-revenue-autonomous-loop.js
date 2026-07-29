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

check('released send reservation permits a same-day retry', () => {
  const to = 'retry@example.com';
  const template = 'revenue-autonomous-followup-v1';
  const key = sendLedgerKey({ to, template });
  const ledger = path.join(testRevenueDir, 'outreach-send-ledger.jsonl');
  fs.writeFileSync(
    ledger,
    `${JSON.stringify({ key, status: 'reserved' })}\n${JSON.stringify({ key, status: 'released' })}\n`,
  );
  const retry = acquireSendReservation({ to, template, prospect: 'retry' });
  assert.strictEqual(retry.ok, true);
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
  assert.match(withLink.body, /visibility|Governed|hard stop/i);
  assert.match(withLink.subject, /Governed agents/i);
  assert.match(withLink.template, /v2-governed/);
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

// Ordering invariant, asserted against the source because it is a property of
// control flow rather than of any single exported helper, and running the whole
// loop in a test would need Stripe/Apollo/Gmail. The bug it guards is concrete:
// while the reply scan ran AFTER the send loop, an unattended run could cold-
// mail a prospect who had already replied and only record the blindness
// afterwards — which is what happened on 2026-07-28 to someone who replied on
// 07-22.
check('reply scan runs before unattended sending, and blindness blocks it', () => {
  const src = fs.readFileSync(
    path.join(__dirname, '..', 'tools', 'revenue-autonomous-loop.js'),
    'utf8',
  );
  const scanAt = src.indexOf('runReplyScan(');
  const gateAt = src.indexOf('const unattendedSendAllowed =');
  const sendAt = src.indexOf('sentCount += 1');
  assert.ok(scanAt > 0, 'reply scan call not found');
  assert.ok(gateAt > 0, 'unattended-send gate not found');
  assert.ok(sendAt > 0, 'send site not found');
  assert.ok(scanAt < gateAt, 'reply scan must run BEFORE the unattended-send gate');
  assert.ok(gateAt < sendAt, 'the gate must precede the send loop');

  // Unknown reply state is a hard stop on cold sending.
  const gate = src.slice(gateAt, gateAt + 500);
  assert.match(gate, /!replyScanBlind/, 'gate must block when the reply scan is blind');

  // A skipped or erroring scan is unknown state, not zero.
  assert.match(src, /replyScanBlind = !args\.fast/, 'skipped scan must mark state unknown');
  assert.match(src, /replyScanBlind = true;/, 'erroring scan must mark state unknown');

  // Blindness must reach the operator: never silenced as a no-op.
  assert.match(src, /!replyScanBlind;/, 'noop calculation must account for blindness');
});

// Someone who replied gets a human answer, never another automated follow-up.
check('prospects who replied are excluded from unattended sends', () => {
  const src = fs.readFileSync(
    path.join(__dirname, '..', 'tools', 'revenue-autonomous-loop.js'),
    'utf8',
  );
  assert.match(src, /repliedEmails/, 'replied-address set must exist');
  assert.match(src, /already_replied/, 'skipped sends must be recorded with a reason');
  const filterAt = src.indexOf('repliedEmails.has');
  const rankAt = src.indexOf('const ranked =');
  assert.ok(filterAt > 0 && rankAt > 0 && filterAt < rankAt, 'filter must precede ranking');
});

console.log(`\nPASS ${n}/${n} revenue-autonomous-loop`);
fs.rmSync(testRevenueDir, { recursive: true, force: true });
