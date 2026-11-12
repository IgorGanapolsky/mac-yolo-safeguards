#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { reviewQuotaBeforeProvision, SOURCE } = require('../tools/quota-before-provision');

function ids(report) {
  return report.findings.map((item) => item.id);
}

function assertHeld(report) {
  assert.strictEqual(report.applied, false);
  assert.strictEqual(report.instanceStarted, false);
  assert.strictEqual(report.askSent, false);
  assert.strictEqual(report.creditsCountedAsCash, false);
  assert.strictEqual(report.checkoutOpened, false);
  assert.strictEqual(report.revenueSharePercent, null);
  assert.strictEqual(report.source, SOURCE);
  assert.deepStrictEqual(Object.keys(report).sort(), [
    'applied',
    'askSent',
    'checkoutOpened',
    'creditsCountedAsCash',
    'findings',
    'humanReview',
    'instanceStarted',
    'ok',
    'revenueSharePercent',
    'source',
    'status',
  ]);
  for (const item of report.findings) {
    assert.deepStrictEqual(Object.keys(item).sort(), ['id', 'severity']);
  }
}

function main() {
  const source = fs.readFileSync(path.join(__dirname, '../tools/quota-before-provision.js'), 'utf8');
  assert.ok(!source.includes('child_process'));
  assert.ok(!source.includes("require('https')"));
  assert.ok(!source.includes("require('http')"));
  assert.ok(!source.includes('fetch('));
  assert.ok(!source.includes('exec('));
  assert.ok(!source.includes('execFile'));
  assert.ok(!source.includes('process.env'));
  assert.ok(!/instanceStarted\s*[:=]\s*true/.test(source));
  assert.ok(!/creditsCountedAsCash\s*[:=]\s*true/.test(source));
  assert.ok(!/askSent\s*[:=]\s*true/.test(source));
  assert.ok(!/revenueSharePercent\s*[:=]\s*\d/.test(source));

  const cited = reviewQuotaBeforeProvision({
    action: 'note',
    note: 'See ' + SOURCE,
  });
  assert.strictEqual(cited.ok, true);
  assert.strictEqual(cited.humanReview, false);
  assertHeld(cited);

  const ask = reviewQuotaBeforeProvision({
    action: 'ask',
    offer: 'Mac YOLO Safeguards',
    note: 'Ask for free credits or written referral terms. Do not start a machine.',
  });
  assert.strictEqual(ask.ok, true);
  assert.strictEqual(ask.humanReview, true);
  assertHeld(ask);

  const unnamed = reviewQuotaBeforeProvision({ action: 'credits' });
  assert.ok(ids(unnamed).includes('offer_unnamed'));
  assert.strictEqual(unnamed.humanReview, false);
  assertHeld(unnamed);

  const absent = reviewQuotaBeforeProvision({
    action: 'create',
    command: 'Create Instance',
    offer: 'Mac YOLO Safeguards',
  });
  assert.ok(ids(absent).includes('no_quota'));
  assert.strictEqual(absent.ok, false);
  assertHeld(absent);

  const held = reviewQuotaBeforeProvision({
    action: 'start',
    quota: '8',
    command: 'Create Cluster',
  });
  assert.ok(ids(held).includes('quota_is_not_a_start'));
  assert.ok(!ids(held).includes('no_quota'));
  assertHeld(held);

  const zero = reviewQuotaBeforeProvision({ action: 'provision', quota: '0' });
  assert.ok(ids(zero).includes('no_quota'));
  assertHeld(zero);

  const claim = reviewQuotaBeforeProvision({
    action: 'note',
    note: 'Our support score is 100% CSAT and the service is white-glove.',
  });
  assert.ok(ids(claim).includes('vendor_claim_as_local'));
  assertHeld(claim);

  const attributed = reviewQuotaBeforeProvision({
    action: 'note',
    note: 'Crusoe publishes a 100% CSAT line on its own support page.',
  });
  assert.strictEqual(attributed.ok, true);
  assertHeld(attributed);

  const cash = reviewQuotaBeforeProvision({
    action: 'note',
    note: 'Treat the credit balance as collected cash.',
  });
  assert.ok(ids(cash).includes('credits_are_not_cash'));
  assertHeld(cash);

  const share = reviewQuotaBeforeProvision({
    action: 'referral',
    offer: 'Mac YOLO Safeguards',
    note: 'Use a 20% revenue share.',
  });
  assert.ok(ids(share).includes('share_unmeasured'));
  assertHeld(share);

  const foreign = reviewQuotaBeforeProvision({
    action: 'ask',
    offer: 'Dayglass',
    note: 'ThumbGate and a Broward tax-deed desk.',
  });
  assert.ok(ids(foreign).includes('not_this_product'));
  assertHeld(foreign);

  const checkout = reviewQuotaBeforeProvision({
    action: 'ask',
    offer: 'Mac YOLO Safeguards',
    note: 'Open https://buy.stripe.com/test',
  });
  assert.ok(ids(checkout).includes('live_checkout'));
  assertHeld(checkout);

  const tool = path.join(__dirname, '../tools/quota-before-provision.js');
  const clearCli = spawnSync(process.execPath, [
    tool,
    '--action', 'ask',
    '--offer', 'Mac YOLO Safeguards',
    '--json',
  ], { encoding: 'utf8' });
  assert.strictEqual(clearCli.status, 0);
  const clearReport = JSON.parse(clearCli.stdout);
  assert.strictEqual(clearReport.ok, true);
  assert.strictEqual(clearReport.instanceStarted, false);
  assert.strictEqual(clearReport.creditsCountedAsCash, false);

  const blockedCli = spawnSync(process.execPath, [
    tool,
    '--action', 'create',
    '--command', 'Create Instance',
  ], { encoding: 'utf8' });
  assert.strictEqual(blockedCli.status, 2);
  assert.ok(blockedCli.stdout.includes('blocked: no_quota'));
  assert.ok(blockedCli.stdout.includes('instanceStarted: false'));
  assert.ok(blockedCli.stdout.includes('creditsCountedAsCash: false'));

  console.log('PASS');
}

main();
