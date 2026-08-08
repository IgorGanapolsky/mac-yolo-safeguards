#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  INFOQ_SOURCE,
  INTERFACES,
  interfaceCatalog,
  validateInterfaces,
  cashTruth,
  liveMatrix,
  campaignWatermark,
  outboundPk,
  outboundClaim,
  outboundStatus,
  classifyStripeCharges,
  buildRevenueReceiptFromClassification,
  highStakesEvalRules,
  parseContentLog,
} = require('../tools/governed-data-mesh');

const FIX = path.join(__dirname, 'fixtures/governed-data-mesh');
const LOG = path.join(FIX, 'content-log.tsv');
const CHARGES = path.join(FIX, 'stripe-charges.json');

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

test('InfoQ source + interface catalog present', () => {
  assert.ok(INFOQ_SOURCE.label.includes('InfoQ'));
  assert.ok(INFOQ_SOURCE.themes.includes('billing_first_unified_platform'));
  const cat = interfaceCatalog();
  assert.strictEqual(cat.ok, true);
  assert.strictEqual(cat.billingFirst, true);
  assert.ok(cat.interfaces.length >= 4);
  assert.ok(INTERFACES.some((i) => i.id === 'cash_truth'));
});

test('validateInterfaces enforces cash invent-ban contract', () => {
  const v = validateInterfaces();
  assert.strictEqual(v.ok, true, JSON.stringify(v.errors));
  assert.strictEqual(v.errors.length, 0);
});

test('cashTruth fail-closed when receipt missing', () => {
  const missing = path.join(os.tmpdir(), `no-receipt-${Date.now()}.json`);
  const t = cashTruth({ receiptPath: missing });
  assert.strictEqual(t.ok, true);
  assert.strictEqual(t.external_net_cents, 0);
  assert.strictEqual(t.has_receipt, false);
  assert.strictEqual(t.owner_test_counts_as_revenue, false);
  assert.ok(t.bans.includes('never_invent_cash'));
});

test('cashTruth reads receipt when present', () => {
  const p = path.join(os.tmpdir(), `receipt-${Date.now()}.json`);
  fs.writeFileSync(
    p,
    JSON.stringify({
      external_net_cents: 0,
      owner_test_net_cents: 15900,
      source: 'test',
      reconciled_at: '2026-07-31T00:00:00Z',
    }),
  );
  const t = cashTruth({ receiptPath: p });
  assert.strictEqual(t.has_receipt, true);
  assert.strictEqual(t.external_net_cents, 0);
  assert.strictEqual(t.owner_test_net_cents, 15900);
  assert.strictEqual(t.owner_test_counts_as_revenue, false);
  fs.unlinkSync(p);
});

test('parseContentLog + liveMatrix classifies LIVE vs Blocked', () => {
  const rows = parseContentLog(LOG);
  assert.ok(rows.length >= 4);
  const m = liveMatrix({ campaign: 'token-burn-leash-20260731', logPath: LOG });
  assert.strictEqual(m.ok, true);
  assert.strictEqual(m.liveCount, 2); // Bluesky + GitHub Discussions
  const bsky = m.matrix.find((x) => x.platform === 'Bluesky');
  assert.strictEqual(bsky.live, true);
  const x = m.matrix.find((x) => x.platform === 'X');
  assert.strictEqual(x.live, false);
  assert.strictEqual(x.liveClass, 'blocked');
});

test('campaignWatermark advances by latest Published per platform', () => {
  const w = campaignWatermark({ logPath: LOG });
  assert.strictEqual(w.ok, true);
  assert.ok(w.platformCount >= 2);
  const x = w.platforms.find((p) => p.platform === 'X');
  assert.ok(x);
  // X has Published on cash-path only; token-burn X is Blocked so watermark is cash-path
  assert.strictEqual(x.campaign, 'cash-path-20260730');
  const bsky = w.platforms.find((p) => p.platform === 'Bluesky');
  assert.strictEqual(bsky.campaign, 'token-burn-leash-20260731');
  assert.ok(bsky.watermark.includes('token-burn-leash-20260731'));
});

test('outboundClaim durable PK blocks double-send', () => {
  const ledger = path.join(os.tmpdir(), `outbound-${Date.now()}.jsonl`);
  const pk = outboundPk('token-burn-leash-20260731', 'sales@pydantic.dev');
  assert.strictEqual(pk.length, 24);

  const first = outboundClaim({
    campaign: 'token-burn-leash-20260731',
    email: 'sales@pydantic.dev',
    status: 'sent',
    messageId: 'msg1',
    sourceOfAddress: 'pydantic.dev/contact',
    ledgerPath: ledger,
  });
  assert.strictEqual(first.ok, true);
  first.write(ledger);

  const dup = outboundClaim({
    campaign: 'token-burn-leash-20260731',
    email: 'SALES@pydantic.dev',
    status: 'sent',
    ledgerPath: ledger,
  });
  assert.strictEqual(dup.ok, false);
  assert.strictEqual(dup.blocked, true);
  assert.strictEqual(dup.reason, 'duplicate_pk');

  const bounce = outboundClaim({
    campaign: 'token-burn-leash-20260731',
    email: 'sales@pydantic.dev',
    status: 'bounce',
    ledgerPath: ledger,
  });
  assert.strictEqual(bounce.ok, true);
  bounce.write(ledger);

  const st = outboundStatus({ campaign: 'token-burn-leash-20260731', ledgerPath: ledger });
  assert.strictEqual(st.counts.bounce, 1);
  fs.unlinkSync(ledger);
});

test('classifyStripeCharges treats owner paid as non-external; failed non-owner is not cash', () => {
  const charges = JSON.parse(fs.readFileSync(CHARGES, 'utf8'));
  const c = classifyStripeCharges({
    charges,
    ownerEmails: ['iganapolsky@gmail.com'],
  });
  // Full refund 4900 excluded; partial refund nets 700 external only
  assert.strictEqual(c.external_net_cents, 700);
  assert.strictEqual(c.owner_test_net_cents, 15900);
  assert.strictEqual(c.owner_test_counts_as_revenue, false);
  assert.strictEqual(c.externalFailed, 1);
  assert.strictEqual(c.externalSuccessCount, 1);

  const receipt = buildRevenueReceiptFromClassification(c);
  assert.strictEqual(receipt.external_net_cents, 700);
  assert.strictEqual(receipt.owner_test_counts_as_revenue, false);
});

test('outboundClaim write re-checks under lock (duplicate after race)', () => {
  const ledger = path.join(os.tmpdir(), `outbound-lock-${Date.now()}.jsonl`);
  const first = outboundClaim({
    campaign: 'c1',
    email: 'a@b.com',
    status: 'sent',
    ledgerPath: ledger,
  });
  assert.strictEqual(first.ok, true);
  const w1 = first.write();
  assert.ok(!w1.blocked, JSON.stringify(w1));

  const second = outboundClaim({
    campaign: 'c1',
    email: 'a@b.com',
    status: 'sent',
    ledgerPath: ledger,
  });
  // Pre-check blocks before write
  assert.strictEqual(second.ok, false);
  assert.strictEqual(second.blocked, true);
  fs.unlinkSync(ledger);
});

test('outboundClaim fails CLOSED when a non-final ledger line is corrupt', () => {
  const ledger = path.join(os.tmpdir(), `outbound-corrupt-${Date.now()}.jsonl`);
  const first = outboundClaim({ campaign: 'c1', email: 'a@b.com', status: 'sent', ledgerPath: ledger });
  assert.strictEqual(first.ok, true);
  first.write(ledger);
  const lines = fs.readFileSync(ledger, 'utf8').trim().split('\n');
  lines[0] = lines[0].slice(0, 30); // damage the sent record
  lines.push(JSON.stringify({ pk: 'zzz', campaign: 'c2', email: 'z@z.com', status: 'sent', ts: 'x' }));
  fs.writeFileSync(ledger, `${lines.join('\n')}\n`);

  // Old behavior: the damaged "sent" row vanished silently and the same
  // prospect could be emailed again. Must now fail closed instead.
  const resend = outboundClaim({ campaign: 'c1', email: 'a@b.com', status: 'sent', ledgerPath: ledger });
  assert.strictEqual(resend.ok, false);
  assert.strictEqual(resend.reason, 'ledger_corrupt_fail_closed');
  assert.ok(fs.existsSync(`${ledger}.rejects.jsonl`), 'rejects were not quarantined');
  fs.unlinkSync(ledger);
  fs.unlinkSync(`${ledger}.rejects.jsonl`);
});

test('outboundClaim tolerates a torn final line and still dedupes earlier sends', () => {
  const ledger = path.join(os.tmpdir(), `outbound-torn-${Date.now()}.jsonl`);
  const first = outboundClaim({ campaign: 'c1', email: 'a@b.com', status: 'sent', ledgerPath: ledger });
  first.write(ledger);
  fs.appendFileSync(ledger, '{"pk":"torn'); // crash mid-append

  const dup = outboundClaim({ campaign: 'c1', email: 'a@b.com', status: 'sent', ledgerPath: ledger });
  assert.strictEqual(dup.ok, false, 'earlier send must still be remembered');
  assert.strictEqual(dup.reason, 'duplicate_pk');

  // A different prospect proceeds; the write heals + acknowledges the fragment,
  // so status reads report zero unexplained rejects afterwards.
  const other = outboundClaim({ campaign: 'c1', email: 'b@c.com', status: 'sent', ledgerPath: ledger });
  assert.strictEqual(other.ok, true);
  const w = other.write(ledger);
  assert.ok(!w.blocked, JSON.stringify(w));
  const st = outboundStatus({ campaign: 'c1', ledgerPath: ledger });
  assert.strictEqual(st.ledgerRejects, 0, 'healed torn tail must not count as corruption');
  assert.strictEqual(st.uniqueEmails, 2);
  fs.unlinkSync(ledger);
  if (fs.existsSync(`${ledger}.rejects.jsonl`)) fs.unlinkSync(`${ledger}.rejects.jsonl`);
});

test('highStakesEvalRules cover invent-cash and LIVE proof', () => {
  const rules = highStakesEvalRules();
  const ids = rules.rules.map((r) => r.id);
  assert.ok(ids.includes('no_invent_cash'));
  assert.ok(ids.includes('live_requires_url'));
  assert.ok(ids.includes('owner_sub_not_revenue'));
});

if (process.exitCode) {
  process.exit(process.exitCode);
}
console.log('All governed-data-mesh tests passed.');
