#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const lib = require(path.join(ROOT, 'tools', 'lib', 'confidence-offer-gate'));
const cli = path.join(ROOT, 'tools', 'confidence-offer-gate.js');

function runCli(args) {
  return spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8' });
}

let passed = 0;
function ok(name) {
  passed += 1;
  console.log(`ok ${passed} ${name}`);
}

assert.strictEqual(lib.PAGE_READ.plan, 'Free');
assert.strictEqual(lib.PAGE_READ.workspace, 'ThumbGate Workspace');
assert.strictEqual(lib.PAGE_READ.rows.length, 6);
assert.ok(lib.PAGE_READ.rows.every((row) => row.name !== 'Mac YOLO Safeguards'));
assert.strictEqual(lib.PAGE_READ.rows.find((row) => row.name.endsWith('(Ship)')).demo, true);
ok('the signed-in experiments page has no Mac app row');

const standing = lib.judgeOffer({ surfaces: [lib.OFFER_URL] });
assert.strictEqual(standing.effect, 'sell');
assert.strictEqual(standing.recommendation, 'Continue');
assert.strictEqual(standing.launched, false);
assert.strictEqual(standing.listingChanged, false);
assert.strictEqual(standing.calledConfidence, false);
assert.strictEqual(standing.recordedCents, 0);
assert.strictEqual(lib.judgeOffer({ surfaces: [lib.OFFER_URL, `${lib.OFFER_URL}/`] }).effect, 'sell');
ok('one buyer URL stays the current listing');

const priced = lib.judgeOffer({ discount: true, priceCents: 3920 });
assert.strictEqual(priced.effect, 'refuse');
assert.strictEqual(priced.recommendation, 'Abort');
assert.strictEqual(priced.listingChanged, false);
assert.strictEqual(priced.priceCents, 4900);
assert.strictEqual(lib.judgeOffer({ rewriteListing: true }).effect, 'refuse');
ok('a price change is refused and the listing stays');

const demo = lib.judgeOffer({ name: 'Reduce checkout time (Ship)' });
assert.strictEqual(demo.effect, 'hold');
assert.strictEqual(demo.recommendation, "Don't ship");
assert.strictEqual(demo.countsAsRevenue, false);
const other = lib.judgeOffer({ name: 'ThumbGate Direct Checkout A/B' });
assert.strictEqual(other.effect, 'hold');
assert.strictEqual(other.countsAsRevenue, false);
assert.strictEqual(lib.judgeOffer({ guardrailHarm: true }).recommendation, 'Abort');
assert.strictEqual(lib.judgeOffer({ sampleRatioMismatch: true }).effect, 'refuse');
ok('demo Ship and a harmed split do not count');

const founder = lib.judgeOffer({
  charge: {
    source: 'measured',
    live: true,
    refunded: false,
    founder: false,
    amountCents: 4900,
    email: 'iganapolsky@gmail.com',
    processor: 'gumroad',
  },
});
assert.strictEqual(founder.countsAsRevenue, false);
assert.strictEqual(founder.recordedCents, 0);
const buyer = lib.judgeOffer({
  surfaces: [lib.OFFER_URL, 'https://example.invalid/mac-yolo-b'],
  successMetric: 'third_party_paid_order',
  charge: {
    source: 'measured',
    live: true,
    refunded: false,
    amountCents: 4900,
    email: 'buyer@example.invalid',
    processor: 'stripe',
  },
});
assert.strictEqual(buyer.recommendation, 'Ship');
assert.strictEqual(buyer.launched, false);
assert.strictEqual(buyer.listingChanged, false);
assert.strictEqual(buyer.countsAsRevenue, true);
assert.strictEqual(buyer.recordedCents, 4900);
assert.strictEqual(lib.judgeOffer({
  surfaces: [lib.OFFER_URL, 'https://example.invalid/mac-yolo-b'],
  successMetric: 'page_view',
}).effect, 'refuse');
assert.strictEqual(lib.judgeOffer({ callConfidence: true, remote: 'https://app.confidence.spotify.com/experiments' }).calledConfidence, false);
ok('only a measured third-party order can count, and nothing launches');

for (const file of ['tools/lib/confidence-offer-gate.js', 'tools/confidence-offer-gate.js']) {
  const source = fs.readFileSync(path.join(ROOT, file), 'utf8');
  assert.ok(!source.includes('fetch('));
  assert.ok(!source.includes('https.request'));
  assert.ok(!source.includes('child_process'));
  assert.ok(!source.includes('9998'));
  assert.ok(!source.includes('89.6'));
}
ok('the check does not call out or store a vendor figure');

const offer = runCli(['offer']);
assert.strictEqual(offer.status, 0);
assert.match(offer.stdout, /^Admitted\. Sell the Mac app\. One buyer URL is not an experiment\./);
assert.match(offer.stdout, /launched=false calledConfidence=false listingChanged=false recorded=0/);
assert.ok(!offer.stdout.includes('4900'));

const discount = runCli(['discount']);
assert.strictEqual(discount.status, 77);
assert.match(discount.stdout, /^Refused\. A price change is not a win/);

const shown = runCli(['demo']);
assert.strictEqual(shown.status, 75);
assert.match(shown.stdout, /^Held\. Demo data is not a Mac YOLO sale\./);

const remote = runCli(['remote']);
assert.strictEqual(remote.status, 77);
assert.match(remote.stdout, /calledConfidence=false/);

const split = runCli(['split', '--left', 'https://example.invalid/a', '--right', 'https://example.invalid/b']);
assert.strictEqual(split.status, 75);
assert.match(split.stdout, /^Held\. Two buyer URLs exist/);

const uplift = runCli(['offer', '--uplift', '89.6']);
assert.strictEqual(uplift.status, 77);
assert.ok(!uplift.stdout.includes('89.6'));
ok('the command keeps the listing and prints no invented figure');

console.log(`test-confidence-offer-gate: PASS ${passed}`);
