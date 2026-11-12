#!/usr/bin/env node
'use strict';

/**
 * Fail closed before an instance, cluster, bucket, disk, or network is
 * started, and before a credit balance or a quota grant is counted as
 * customer cash. A positive quota still does not start a machine.
 * Source: https://console.crusoecloud.com/home
 *
 * This file does not start a machine, send a request, open a checkout,
 * or read a processor. The revenue-share field stays null.
 */

const SOURCE = 'https://console.crusoecloud.com/home';

const PROVISION = new Set(['provision', 'create', 'start']);
const ASK = new Set(['ask', 'credits', 'referral']);

const PROVISION_TEXT = /\b(?:create|start|provision)\b[^\n]{0,40}\b(?:instance|cluster|bucket|disk|vpc)\b/i;
const CHECKOUT = /buy\.stripe\.com|checkout\.stripe\.com/i;
const VENDOR_CLAIM = /100\s*%\s*csat|white-glove/i;
const ATTRIBUTED = /\bcrusoe\b/i;
const FOREIGN = /\b(?:dayglass|thumbgate|tax[- ]deed|broward)\b/i;
const CASH_CLAIM = /\b(?:credit balance|quota grant|free credits)\b[^\n]{0,80}\b(?:revenue|collected cash|customer cash)\b/i;
const SHARE_CLAIM = /\b\d+\s*%\s*(?:revenue share|referral share)\b/i;

function finding(id) {
  return { id, severity: 'block' };
}

function scanText(text) {
  return String(text || '').replace(/https?:\/\/\S+/g, ' ');
}

function intOrNull(value) {
  if (value === undefined || value === null || value === '') return null;
  const text = String(value);
  if (!/^\d+$/.test(text)) return null;
  return Number(text);
}

function reviewQuotaBeforeProvision(input = {}) {
  const action = String(input.action || 'note').toLowerCase();
  const note = String(input.note || '');
  const command = String(input.command || '');
  const offer = String(input.offer || '').trim();
  const raw = [note, command, offer].filter(Boolean).join('\n');
  const blob = scanText(raw);
  const findings = [];
  const asking = ASK.has(action);
  const provisioning = PROVISION.has(action) || PROVISION_TEXT.test(raw);

  if (FOREIGN.test(blob)) findings.push(finding('not_this_product'));
  if (CHECKOUT.test(raw)) findings.push(finding('live_checkout'));
  if (VENDOR_CLAIM.test(blob) && !ATTRIBUTED.test(blob)) findings.push(finding('vendor_claim_as_local'));
  if (CASH_CLAIM.test(blob)) findings.push(finding('credits_are_not_cash'));
  if (SHARE_CLAIM.test(blob)) findings.push(finding('share_unmeasured'));
  if (asking && !offer) findings.push(finding('offer_unnamed'));

  if (provisioning) {
    const quota = intOrNull(input.quota);
    findings.push(finding(quota !== null && quota >= 1 ? 'quota_is_not_a_start' : 'no_quota'));
  }

  const seen = new Set();
  const unique = findings.filter((item) => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
  const clear = unique.length === 0;

  return {
    ok: clear,
    status: clear ? 'clear' : 'blocked',
    findings: unique,
    applied: false,
    instanceStarted: false,
    askSent: false,
    creditsCountedAsCash: false,
    checkoutOpened: false,
    revenueSharePercent: null,
    humanReview: clear && asking,
    source: SOURCE,
  };
}

function argValue(argv, flag) {
  const index = argv.indexOf(flag);
  if (index < 0 || index + 1 >= argv.length) return '';
  const value = argv[index + 1];
  return value.startsWith('--') ? '' : value;
}

function main() {
  const argv = process.argv.slice(2);
  const report = reviewQuotaBeforeProvision({
    action: argValue(argv, '--action') || 'note',
    note: argValue(argv, '--note'),
    command: argValue(argv, '--command'),
    offer: argValue(argv, '--offer'),
    quota: argValue(argv, '--quota'),
  });
  if (argv.indexOf('--json') >= 0) console.log(JSON.stringify(report));
  else {
    console.log(report.ok ? 'Quota before provision: clear' : 'Quota before provision: blocked');
    for (const item of report.findings) console.log('blocked: ' + item.id);
    console.log('applied: false');
    console.log('instanceStarted: false');
    console.log('creditsCountedAsCash: false');
  }
  process.exit(report.ok ? 0 : 2);
}

if (require.main === module) main();

module.exports = {
  SOURCE,
  reviewQuotaBeforeProvision,
};
