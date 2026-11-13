#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { reviewOptBeforeScale, SOURCE } = require('../tools/opt-before-scale');

function ids(report) {
  return report.findings.map((item) => item.id);
}

function assertHeld(report) {
  assert.strictEqual(report.applied, false);
  assert.strictEqual(report.spendStarted, false);
  assert.strictEqual(report.trafficBought, false);
  assert.strictEqual(report.checkoutOpened, false);
  assert.strictEqual(report.localTopLineGrowth, null);
  assert.strictEqual(report.localMarginExpansion, null);
  assert.strictEqual(report.source, SOURCE);
  assert.deepStrictEqual(Object.keys(report).sort(), [
    'applied',
    'checkoutOpened',
    'findings',
    'humanReview',
    'localMarginExpansion',
    'localTopLineGrowth',
    'ok',
    'source',
    'spendStarted',
    'status',
    'trafficBought',
  ]);
  for (const item of report.findings) {
    assert.deepStrictEqual(Object.keys(item).sort(), ['id', 'severity']);
  }
}

function main() {
  const source = fs.readFileSync(path.join(__dirname, '../tools/opt-before-scale.js'), 'utf8');
  assert.ok(!source.includes('child_process'));
  assert.ok(!source.includes("require('https')"));
  assert.ok(!source.includes("require('http')"));
  assert.ok(!source.includes('fetch('));
  assert.ok(!source.includes('exec('));
  assert.ok(!source.includes('execFile'));
  assert.ok(!source.includes('process.env'));
  assert.ok(!/localTopLineGrowth\s*[:=]\s*(true|false|[0-9])/.test(source));
  assert.ok(!/localMarginExpansion\s*[:=]\s*(true|false|[0-9])/.test(source));

  const cited = reviewOptBeforeScale({
    action: 'note',
    note: 'See ' + SOURCE,
  });
  assert.strictEqual(cited.ok, true);
  assert.strictEqual(cited.humanReview, false);
  assertHeld(cited);

  const measure = reviewOptBeforeScale({
    action: 'measure',
    offer: 'Pro Guard',
  });
  assert.strictEqual(measure.ok, true);
  assert.strictEqual(measure.humanReview, false);
  assertHeld(measure);

  const opt = reviewOptBeforeScale({
    action: 'opt',
    offer: 'Diagnostic',
    note: 'Name the onboarding step before any traffic buy. See ' + SOURCE,
  });
  assert.strictEqual(opt.ok, true);
  assertHeld(opt);

  const unnamed = reviewOptBeforeScale({ action: 'measure' });
  assert.ok(ids(unnamed).includes('offer_unnamed'));
  assert.strictEqual(unnamed.humanReview, false);
  assertHeld(unnamed);

  const quoted = reviewOptBeforeScale({
    action: 'note',
    note: 'Tony Robbins teaches that 1.10 three times is 1.331, a 33.1% figure, and mentions 30-50% margins.',
  });
  assert.strictEqual(quoted.ok, true);
  assertHeld(quoted);

  for (const note of [
    'A 10% lift on each lever yields 33.1% top-line growth.',
    'The formula result is 1.331.',
    'Net operating margins expand 30-50%.',
    'Net operating margins expand 30 to 50%.',
    'Routing saves 375x.',
    'Input is 0.04/1M.',
  ]) {
    const blocked = reviewOptBeforeScale({ action: 'note', note });
    assert.ok(ids(blocked).includes('vendor_claim_as_local'), note);
    assert.strictEqual(blocked.localTopLineGrowth, null);
    assert.strictEqual(blocked.localMarginExpansion, null);
    assertHeld(blocked);
  }

  for (const input of [
    { action: 'scale' },
    { action: 'maximize', outsideClients: '0', averageCollectedCents: '1900', repeatPayers: '1' },
    { action: 'ads', outsideClients: '3', averageCollectedCents: '0', repeatPayers: '1' },
    { action: 'traffic', outsideClients: '3', averageCollectedCents: '1900', repeatPayers: '0' },
    { action: 'spend', outsideClients: '3', averageCollectedCents: '1900' },
    { action: 'scale', outsideClients: '3.5', averageCollectedCents: '1900', repeatPayers: '1' },
    {
      action: 'scale',
      outsideClients: '9',
      averageCollectedCents: '1900',
      repeatPayers: '1',
      clientEmails: ['iganapolsky@gmail.com', 'founder@dayglass.app'],
    },
  ]) {
    const blocked = reviewOptBeforeScale(input);
    assert.ok(ids(blocked).includes('levers_unmeasured'), JSON.stringify(input));
    assert.strictEqual(blocked.humanReview, false);
    assert.strictEqual(blocked.spendStarted, false);
    assertHeld(blocked);
  }

  const ready = reviewOptBeforeScale({
    action: 'scale',
    outsideClients: '3',
    averageCollectedCents: '1900',
    repeatPayers: '1',
    offer: 'Pro Guard',
  });
  assert.strictEqual(ready.ok, true);
  assert.strictEqual(ready.humanReview, true);
  assert.strictEqual(ready.spendStarted, false);
  assertHeld(ready);

  const oneBuyer = reviewOptBeforeScale({
    action: 'ads',
    clientEmails: ['iganapolsky@gmail.com', 'buyer@example.com'],
    averageCollectedCents: '4900',
    repeatPayers: '1',
  });
  assert.strictEqual(oneBuyer.ok, true);
  assert.strictEqual(oneBuyer.humanReview, true);
  assert.strictEqual(oneBuyer.spendStarted, false);
  assertHeld(oneBuyer);

  for (const input of [
    { action: 'noi', offer: 'Pro Guard' },
    { action: 'credit' },
    { action: 'exchange' },
    { action: 'loi' },
    { action: 'measure', offer: 'Pro Guard', note: 'Submit a letter of intent.' },
    { action: 'note', note: 'Use a 1031 exchange on this cash.' },
    { action: 'note', note: 'Step in with private credit.' },
    { action: 'opt', offer: 'Dayglass Pro' },
    { action: 'note', note: 'This is a ThumbGate checkout.' },
    { action: 'note', note: 'Broward tax-deed sales count here.' },
  ]) {
    const blocked = reviewOptBeforeScale(input);
    assert.ok(ids(blocked).includes('not_this_product'), JSON.stringify(input));
    assertHeld(blocked);
  }

  const checkout = reviewOptBeforeScale({
    action: 'note',
    command: 'open https://buy.stripe.com/test',
  });
  assert.ok(ids(checkout).includes('live_checkout'));
  assert.strictEqual(checkout.checkoutOpened, false);
  assertHeld(checkout);

  const session = reviewOptBeforeScale({
    action: 'note',
    note: 'https://checkout.stripe.com/c/pay/cs_test_example',
  });
  assert.ok(ids(session).includes('live_checkout'));
  assertHeld(session);

  const stacked = reviewOptBeforeScale({
    action: 'scale',
    offer: 'ThumbGate',
    note: 'Yields 33.1% and use private credit.',
    command: 'open https://checkout.stripe.com/c/pay/cs_live_example',
  });
  assert.ok(ids(stacked).includes('levers_unmeasured'));
  assert.ok(ids(stacked).includes('not_this_product'));
  assert.ok(ids(stacked).includes('vendor_claim_as_local'));
  assert.ok(ids(stacked).includes('live_checkout'));
  assert.strictEqual(stacked.spendStarted, false);
  assert.strictEqual(stacked.checkoutOpened, false);
  assertHeld(stacked);

  const tool = path.join(__dirname, '../tools/opt-before-scale.js');
  const clearCli = spawnSync(process.execPath, [
    tool,
    '--action', 'measure',
    '--offer', 'Pro Guard',
    '--json',
  ], { encoding: 'utf8' });
  assert.strictEqual(clearCli.status, 0);
  const clearReport = JSON.parse(clearCli.stdout);
  assert.strictEqual(clearReport.ok, true);
  assert.strictEqual(clearReport.spendStarted, false);
  assert.strictEqual(clearReport.localTopLineGrowth, null);

  const blockedCli = spawnSync(process.execPath, [
    tool,
    '--action', 'scale',
    '--client-email', 'igor.ganapolsky@icloud.com',
    '--average-cents', '4900',
    '--repeat-payers', '2',
    '--json',
  ], { encoding: 'utf8' });
  assert.strictEqual(blockedCli.status, 2);
  const blockedReport = JSON.parse(blockedCli.stdout);
  assert.strictEqual(blockedReport.ok, false);
  assert.ok(blockedReport.findings.some((item) => item.id === 'levers_unmeasured'));
  assert.strictEqual(blockedReport.spendStarted, false);
  assert.strictEqual(blockedReport.trafficBought, false);

  console.log('test-opt-before-scale: PASS');
}

main();
