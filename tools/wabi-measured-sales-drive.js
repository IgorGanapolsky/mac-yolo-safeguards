#!/usr/bin/env node
'use strict';

/**
 * Measured sales drive for the three shared widgets in Wabi's 2026-10-29
 * welcome mail: a plan the thread can add to, a countdown the thread can see,
 * and a scan of email for a deadline.
 *
 * Counts, savings, and deadlines stay empty unless the caller passes a
 * measurementSource. Checkout links stay off until checkoutLive is true.
 * This module does not send mail.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { hostnameOf, hostInList } = require('./lib/safe-url-host');

const BANNED_EMAIL_DOMAINS = ['ecisolutions.com', 'ecinexus.com'];
const BANNED_CHECKOUT_HOSTS = [
  'buy.stripe.com',
  'checkout.stripe.com',
  'gumroad.com',
  'thumbgate.ai',
  'thumbgate.app',
];

function finiteNonNegative(value, fallback) {
  if (value == null || value === '') return fallback;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return null;
  return n;
}

function prospectEmailBlocked(email) {
  const lower = String(email || '').toLowerCase().trim();
  const at = lower.lastIndexOf('@');
  if (at < 0) return false;
  return hostInList(lower.slice(at + 1), BANNED_EMAIL_DOMAINS);
}

function checkoutUrlOrNull(url, checkoutLive) {
  if (checkoutLive !== true) return null;
  const host = hostnameOf(url);
  if (!host || hostInList(host, BANNED_CHECKOUT_HOSTS)) return null;
  return String(url);
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function renderPlan(receipt) {
  const savings =
    receipt.estimatedAnnualSavingsUsd == null
      ? 'not measured'
      : `$${receipt.estimatedAnnualSavingsUsd.toFixed(2)}`;
  const countdown = receipt.countdown
    ? escapeHtml(receipt.countdown.deadlineIso)
    : 'none';
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Mac YOLO Safeguards shared sales plan</title>
</head>
<body>
  <h1>Mac YOLO Safeguards shared sales plan</h1>
  <p>Cleared revenue $${receipt.clearedRevenueUsd.toFixed(2)}.</p>
  <p>Checkout live: ${receipt.checkoutLive ? 'yes' : 'no'}.</p>
  <p>Annual savings: ${escapeHtml(savings)}.</p>
  <p>Open buying windows: ${receipt.activeWindowsCount}.</p>
  <p>Countdown: ${countdown}.</p>
  <p>Emails sent: 0. Outbound spend: $0.00.</p>
</body>
</html>
`;
}

function driveMeasuredSales(input = {}) {
  const measurementSource =
    typeof input.measurementSource === 'string' ? input.measurementSource.trim() : '';
  const measured = measurementSource.length > 0;
  const checkoutStarts24h = finiteNonNegative(input.checkoutStarts24h, 0);
  const cancelPageViews24h = finiteNonNegative(input.cancelPageViews24h, 0);
  if (checkoutStarts24h == null || cancelPageViews24h == null) {
    return { ok: false, blockedReason: 'invalid_checkout_counts', emailsSent: 0, outboundCashSpendUsd: 0 };
  }
  if ((checkoutStarts24h !== 0 || cancelPageViews24h !== 0) && !measured) {
    return {
      ok: false,
      blockedReason: 'unmeasured_checkout_counts',
      emailsSent: 0,
      outboundCashSpendUsd: 0,
    };
  }

  const nowMs = finiteNonNegative(input.nowMs, Date.now());
  const leads = Array.isArray(input.leads) ? input.leads : [];
  const windows = [];
  for (const lead of leads) {
    if (!lead || typeof lead !== 'object') continue;
    if (prospectEmailBlocked(lead.email || '')) continue;
    if (!measured) continue;
    const hoursLeft = Number(lead.hoursLeft);
    if (!Number.isFinite(hoursLeft) || hoursLeft <= 0) continue;
    const id = String(lead.id || '').trim();
    if (!id) continue;
    windows.push({
      id,
      windowType: String(lead.windowType || 'measured'),
      hoursLeft,
      checkoutUrl: checkoutUrlOrNull(lead.checkoutUrl, input.checkoutLive === true),
    });
  }

  let estimatedAnnualSavingsUsd = null;
  if (measured && input.measuredAnnualSavingsUsd != null && input.measuredAnnualSavingsUsd !== '') {
    const savings = Number(input.measuredAnnualSavingsUsd);
    if (Number.isFinite(savings) && savings >= 0) estimatedAnnualSavingsUsd = savings;
  }

  let countdown = null;
  if (measured && typeof input.deadlineIso === 'string') {
    const deadlineMs = Date.parse(input.deadlineIso);
    if (Number.isFinite(deadlineMs) && nowMs != null && deadlineMs > nowMs) {
      countdown = {
        deadlineIso: new Date(deadlineMs).toISOString(),
        hoursRemaining: Math.round(((deadlineMs - nowMs) / 3600000) * 10) / 10,
      };
    }
  }

  const clearedRevenueUsd = finiteNonNegative(input.clearedRevenueUsd, 0);
  if (clearedRevenueUsd == null) {
    return { ok: false, blockedReason: 'invalid_cleared_revenue', emailsSent: 0, outboundCashSpendUsd: 0 };
  }

  const receipt = {
    schema: 'wabi-measured-sales-drive/v1',
    ok: true,
    generatedAt: new Date(nowMs == null ? Date.now() : nowMs).toISOString(),
    pdfPresent: input.pdfPresent === true,
    pdfPath: '/Users/iganapolsky/Downloads/wabi.pdf',
    checkoutLive: input.checkoutLive === true,
    clearedRevenueUsd,
    checkoutStarts24h: measured ? checkoutStarts24h : 0,
    cancelPageViews24h: measured ? cancelPageViews24h : 0,
    measurementSource: measured ? measurementSource : null,
    estimatedAnnualSavingsUsd,
    countdown,
    activeWindowsCount: windows.length,
    windows,
    emailsSent: 0,
    outboundCashSpendUsd: 0,
  };
  receipt.htmlWidget = renderPlan(receipt);
  return receipt;
}

function writeMeasuredReceipt(receipt, dir) {
  if (!receipt || receipt.ok !== true) {
    throw new Error('refuse to write a blocked sales drive');
  }
  const root = dir || path.join(os.homedir(), '.hermes', 'wabi-measured-sales');
  fs.mkdirSync(root, { recursive: true });
  const jsonPath = path.join(root, 'latest.json');
  const htmlPath = path.join(root, 'shared-plan.html');
  fs.writeFileSync(jsonPath, `${JSON.stringify(receipt, null, 2)}\n`);
  fs.writeFileSync(htmlPath, receipt.htmlWidget);
  return { jsonPath, htmlPath };
}

function readInput(argv) {
  const flag = argv.indexOf('--input');
  if (flag === -1) return {};
  const file = argv[flag + 1];
  if (!file) throw new Error('--input needs a json file');
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

if (require.main === module) {
  const receipt = driveMeasuredSales(readInput(process.argv));
  if (process.argv.includes('--write') && receipt.ok) {
    const written = writeMeasuredReceipt(receipt);
    receipt.written = written;
  }
  process.stdout.write(`${JSON.stringify(receipt, null, 2)}\n`);
  process.exit(receipt.ok ? 0 : 1);
}

module.exports = {
  driveMeasuredSales,
  writeMeasuredReceipt,
  prospectEmailBlocked,
};
