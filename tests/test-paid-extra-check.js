#!/usr/bin/env node
'use strict';

const assert = require('assert');
const { spawnSync } = require('child_process');
const path = require('path');
const { guardPaidExtra, guardOfferRow } = require('../tools/paid-extra-check');

const tool = path.join(__dirname, '..', 'tools', 'paid-extra-check.js');

function ids(report) {
  return report.findings;
}

assert.deepStrictEqual(ids(guardPaidExtra(null)), ['missing-offer']);
assert.strictEqual(guardPaidExtra(null).ok, false);
assert.strictEqual(guardPaidExtra({ priceCents: 0, paidSha256: 'same', freeSha256: 'same' }).ok, true);

const monthly = guardPaidExtra({
  priceCents: 1900,
  paidOnlyBehavior: 'stops leftovers during an unattended run',
});
assert.strictEqual(monthly.ok, true);
assert.deepStrictEqual(monthly.findings, []);

const sameFile = guardPaidExtra({
  priceCents: 4900,
  paidSha256: 'same-file',
  freeSha256: 'same-file',
  paidOnlyBehavior: 'a report the free app does not write',
});
assert.strictEqual(sameFile.ok, false);
assert.ok(ids(sameFile).indexOf('paid-file-is-free-file') !== -1);

const unnamed = guardPaidExtra({ priceCents: 4900, paidOnlyBehavior: '   ' });
assert.deepStrictEqual(ids(unnamed), ['paid-offer-names-no-extra']);

const renamed = guardPaidExtra({
  priceCents: 4900,
  paidOnlyBehavior: 'Mac YOLO Safeguards',
  freeProductName: 'mac yolo safeguards',
});
assert.deepStrictEqual(ids(renamed), ['paid-name-is-free-name']);

const different = guardPaidExtra({
  priceCents: 4900,
  paidSha256: 'paid-file',
  freeSha256: 'free-file',
  paidOnlyBehavior: 'a written incident report',
  freeProductName: 'Mac YOLO Safeguards',
});
assert.strictEqual(different.ok, true);

const catalog = guardOfferRow({
  offer: 'Agent Reliability Diagnostic',
  stripe_amount_usd: '499.00',
  status: 'ready',
});
assert.strictEqual(catalog.ok, true);

const blankRow = guardOfferRow({ stripe_amount_usd: '49.00', offer: '' });
assert.ok(ids(blankRow).indexOf('paid-offer-names-no-extra') !== -1);

const rowFile = guardOfferRow({
  offer: 'Corporate-Expense Reliability Kit',
  stripe_amount_usd: '49.00',
  paid_sha256: 'disk',
  free_sha256: 'disk',
});
assert.ok(ids(rowFile).indexOf('paid-file-is-free-file') !== -1);

function run(input) {
  return spawnSync(process.execPath, [tool], { input, encoding: 'utf8' });
}

const blocked = run(JSON.stringify({ priceCents: 4900 }));
assert.strictEqual(blocked.status, 1);
assert.strictEqual(blocked.stdout, 'paid-offer-names-no-extra\n');

const open = run(JSON.stringify({ priceCents: 0 }));
assert.strictEqual(open.status, 0);
assert.strictEqual(open.stdout, '');

const junk = run('not-json');
assert.strictEqual(junk.status, 1);
assert.strictEqual(junk.stdout, 'missing-offer\n');

console.log('test-paid-extra-check: PASS');
