#!/usr/bin/env node
'use strict';

/**
 * Fail closed when spend or traffic would scale before three local cash levers
 * are present, when a curriculum percent is stated as our result, or when a
 * property, private-credit, or exchange action is aimed at this product.
 * Source: https://www.tonyrobbins.com/events/business-mastery
 *
 * This file does not spend, buy traffic, open a checkout, or read a processor.
 * Growth and margin fields stay null.
 */

const SOURCE = 'https://www.tonyrobbins.com/events/business-mastery';

const FOUNDER = new Set([
  'iganapolsky@gmail.com',
  'igor.ganapolsky@icloud.com',
  'ig5973700@gmail.com',
  'founder@dayglass.app',
  'pro@dayglass.app',
]);

const SCALE = new Set(['scale', 'maximize', 'ads', 'traffic', 'spend']);
const OPT = new Set(['opt', 'measure']);
const PROPERTY = new Set(['noi', 'property', 'loi', 'credit', 'exchange']);

const PROPERTY_TEXT = /\b1031\b|\bprivate credit\b|\bseller[- ]carry\b|\bsubject-to\b|\bletter of intent\b|\bunderwrite a property\b/i;
const CHECKOUT = /buy\.stripe\.com|checkout\.stripe\.com/i;
const VENDOR_CLAIM = /33\.1\s*%|1\.331|30\s*[-–]\s*50\s*%|30\s+to\s+50\s*%|\b375x\b|0\.04\s*\/\s*1m/i;
const ATTRIBUTED = /\btony robbins\b|\bbusiness mastery\b/i;
const FOREIGN = /\b(?:dayglass|thumbgate|tax[- ]deed|broward)\b/i;

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

function outsideCount(input) {
  const emails = Array.isArray(input.clientEmails) ? input.clientEmails : [];
  if (emails.length) {
    return emails.filter((item) => !FOUNDER.has(String(item || '').trim().toLowerCase())).length;
  }
  return intOrNull(input.outsideClients);
}

function reviewOptBeforeScale(input = {}) {
  const action = String(input.action || 'note').toLowerCase();
  const note = String(input.note || '');
  const command = String(input.command || '');
  const offer = String(input.offer || '').trim();
  const raw = [note, command, offer].filter(Boolean).join('\n');
  const blob = scanText(raw);
  const findings = [];
  const scaling = SCALE.has(action);
  const optimizing = OPT.has(action);

  if (PROPERTY.has(action) || PROPERTY_TEXT.test(blob)) findings.push(finding('not_this_product'));
  if (FOREIGN.test(blob)) findings.push(finding('not_this_product'));
  if (CHECKOUT.test(raw)) findings.push(finding('live_checkout'));
  if (VENDOR_CLAIM.test(blob) && !ATTRIBUTED.test(blob)) findings.push(finding('vendor_claim_as_local'));
  if (optimizing && !offer) findings.push(finding('offer_unnamed'));

  if (scaling) {
    const outside = outsideCount(input);
    const average = intOrNull(input.averageCollectedCents);
    const repeat = intOrNull(input.repeatPayers);
    const measured = outside !== null && outside >= 1
      && average !== null && average > 0
      && repeat !== null && repeat >= 1;
    if (!measured) findings.push(finding('levers_unmeasured'));
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
    spendStarted: false,
    trafficBought: false,
    checkoutOpened: false,
    humanReview: clear && scaling,
    localTopLineGrowth: null,
    localMarginExpansion: null,
    source: SOURCE,
  };
}

function argValue(argv, flag) {
  const index = argv.indexOf(flag);
  if (index < 0 || index + 1 >= argv.length) return '';
  const value = argv[index + 1];
  return value.startsWith('--') ? '' : value;
}

function argValues(argv, flag) {
  const values = [];
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] !== flag) continue;
    const value = argv[i + 1];
    if (!value || value.startsWith('--')) continue;
    values.push(value);
  }
  return values;
}

function main() {
  const argv = process.argv.slice(2);
  const emails = argValues(argv, '--client-email');
  const report = reviewOptBeforeScale({
    action: argValue(argv, '--action') || 'note',
    note: argValue(argv, '--note'),
    command: argValue(argv, '--command'),
    offer: argValue(argv, '--offer'),
    outsideClients: argValue(argv, '--outside-clients'),
    averageCollectedCents: argValue(argv, '--average-cents'),
    repeatPayers: argValue(argv, '--repeat-payers'),
    clientEmails: emails,
  });
  if (argv.indexOf('--json') >= 0) console.log(JSON.stringify(report));
  else {
    console.log(report.ok ? 'Opt before scale: clear' : 'Opt before scale: blocked');
    for (const item of report.findings) console.log('blocked: ' + item.id);
    console.log('applied: false');
    console.log('spendStarted: false');
    console.log('humanReview: ' + report.humanReview);
  }
  process.exit(report.ok ? 0 : 2);
}

if (require.main === module) main();

module.exports = {
  SOURCE,
  FOUNDER,
  reviewOptBeforeScale,
};
