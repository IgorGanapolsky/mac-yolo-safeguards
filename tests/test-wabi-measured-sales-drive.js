#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  driveMeasuredSales,
  writeMeasuredReceipt,
  prospectEmailBlocked,
} = require('../tools/wabi-measured-sales-drive');

function forbidden(receipt) {
  const blob = JSON.stringify(receipt);
  for (const needle of [
    'buy.stripe.com',
    'thumbgate.ai',
    'thumbgate.app',
    'gumroad.com',
    'CleanMyMac',
    '47.24',
    'ecisolutions.com',
  ]) {
    assert.strictEqual(blob.includes(needle), false, needle);
  }
}

function main() {
  assert.strictEqual(prospectEmailBlocked('dev@mail.ecisolutions.com'), true);
  assert.strictEqual(prospectEmailBlocked('dev@ecinexus.com'), true);
  assert.strictEqual(prospectEmailBlocked('founder@acme.ai'), false);

  const empty = driveMeasuredSales({});
  assert.strictEqual(empty.ok, true);
  assert.strictEqual(empty.checkoutStarts24h, 0);
  assert.strictEqual(empty.cancelPageViews24h, 0);
  assert.strictEqual(empty.estimatedAnnualSavingsUsd, null);
  assert.strictEqual(empty.countdown, null);
  assert.strictEqual(empty.activeWindowsCount, 0);
  assert.strictEqual(empty.emailsSent, 0);
  assert.strictEqual(empty.outboundCashSpendUsd, 0);
  assert.strictEqual(empty.checkoutLive, false);
  assert.strictEqual(empty.clearedRevenueUsd, 0);
  assert.strictEqual(empty.pdfPresent, false);
  assert.ok(empty.htmlWidget.includes('not measured'));
  assert.ok(empty.htmlWidget.includes('$0.00'));
  forbidden(empty);

  const fixture = driveMeasuredSales({ checkoutStarts24h: 8, cancelPageViews24h: 4 });
  assert.strictEqual(fixture.ok, false);
  assert.strictEqual(fixture.blockedReason, 'unmeasured_checkout_counts');
  assert.strictEqual(fixture.emailsSent, 0);

  const invented = driveMeasuredSales({ measuredAnnualSavingsUsd: 13920, teamMacs: 8 });
  assert.strictEqual(invented.estimatedAnnualSavingsUsd, null);
  assert.strictEqual(JSON.stringify(invented).includes('13920'), false);

  const nowMs = Date.parse('2026-10-29T18:00:00.000Z');
  const measured = driveMeasuredSales({
    measurementSource: 'ledger rows 0; gmail seller receipts 0',
    nowMs,
    checkoutStarts24h: 0,
    cancelPageViews24h: 0,
    clearedRevenueUsd: 0,
    checkoutLive: false,
    pdfPresent: false,
    deadlineIso: '2026-10-29T12:00:00.000Z',
    leads: [
      {
        id: 'eci-renewal',
        email: 'buyer@ecisolutions.com',
        hoursLeft: 12,
        checkoutUrl: 'https://buy.stripe.com/example',
      },
      {
        id: 'measured-window',
        email: 'buyer@acme.ai',
        hoursLeft: 6,
        windowType: 'abandoned_checkout',
        checkoutUrl: 'https://iganapolsky.gumroad.com/l/vcrho',
      },
    ],
  });
  assert.strictEqual(measured.ok, true);
  assert.strictEqual(measured.activeWindowsCount, 1);
  assert.strictEqual(measured.windows[0].id, 'measured-window');
  assert.strictEqual(measured.windows[0].checkoutUrl, null);
  assert.strictEqual(measured.countdown, null);
  forbidden(measured);

  const liveDeadline = driveMeasuredSales({
    measurementSource: 'a dated contract the operator passed in',
    nowMs,
    deadlineIso: '2026-10-30T06:00:00.000Z',
    checkoutLive: true,
    leads: [
      {
        id: 'seat',
        email: 'buyer@acme.ai',
        hoursLeft: 12,
        checkoutUrl: 'https://example.com/checkout',
      },
    ],
  });
  assert.strictEqual(liveDeadline.countdown.deadlineIso, '2026-10-30T06:00:00.000Z');
  assert.strictEqual(liveDeadline.countdown.hoursRemaining, 12);
  assert.strictEqual(liveDeadline.windows[0].checkoutUrl, 'https://example.com/checkout');

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wabi-measured-'));
  const written = writeMeasuredReceipt(measured, dir);
  const saved = JSON.parse(fs.readFileSync(written.jsonPath, 'utf8'));
  assert.strictEqual(saved.activeWindowsCount, 1);
  assert.ok(fs.readFileSync(written.htmlPath, 'utf8').includes('Checkout live: no'));
  assert.throws(() => writeMeasuredReceipt(fixture, dir), /blocked sales drive/);

  process.stdout.write('MAC_YOLO_WABI_MEASURED_SALES_OK\n');
}

main();
