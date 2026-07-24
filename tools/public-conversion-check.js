#!/usr/bin/env node
'use strict';

const fs = require('fs');

const usage = `Usage:
  node tools/public-conversion-check.js

Verifies that public repo docs still expose the paid hardening path without
weakening safety boundaries. This tool does not send outreach, mutate files, or
prove revenue.`;

function read(path) {
  return fs.readFileSync(path, 'utf8');
}

function check(condition, label, failures) {
  if (condition) {
    console.log(`[OK] ${label}`);
  } else {
    console.log(`[FAIL] ${label}`);
    failures.push(label);
  }
}

function before(text, earlier, later) {
  const earlierIndex = text.indexOf(earlier);
  const laterIndex = text.indexOf(later);
  return earlierIndex !== -1 && laterIndex !== -1 && earlierIndex < laterIndex;
}

// Exact-match URL presence check (not a raw substring test on the full document text).
// Extracts every URL token from `text` and requires one to equal `url` exactly, so a
// document containing a lookalike (e.g. an evil.com URL that merely embeds `url` as a
// substring) cannot satisfy the check.
function includesExactUrl(text, url) {
  const urls = text.match(/https?:\/\/[^\s)\]"'<>]+/g) || [];
  return urls.includes(url);
}

function main() {
  const failures = [];
  const readme = read('README.md');
  const hardening = read('docs/AI-AGENT-HARDENING.md');
  const partner = read('docs/PARTNER-PILOT.md');
  const operatingPlan = read('docs/REVENUE-OPERATING-PLAN.md');
  const closeKit = read('docs/SALES-CLOSE-KIT.md');
  const paidIssue = read('.github/ISSUE_TEMPLATE/paid-hardening-inquiry.yml');
  const freeIssue = read('.github/ISSUE_TEMPLATE/free-incident-report.yml');
  const config = read('.github/ISSUE_TEMPLATE/config.yml');

  check(readme.includes('**Paid reliability help:**'), 'README has one-line paid reliability CTA', failures);
  check(before(readme, '**Paid reliability help:**', '## Background'), 'README paid CTA appears before Background', failures);
  check(includesExactUrl(readme, 'https://cal.com/igor-g-kvqxfo/30min'), 'README links Cal.com triage', failures);
  check(readme.includes('./docs/PARTNER-PILOT.md'), 'README links Partner Pilot', failures);
  check(readme.includes('./docs/SALES-CLOSE-KIT.md'), 'README links Sales Close Kit', failures);
  check(readme.includes('paid-hardening-inquiry.yml'), 'README links paid hardening inquiry', failures);
  check(readme.includes('Do not post secrets'), 'README warns public issues must not include secrets', failures);

  check(hardening.includes('[Partner Pilot](./PARTNER-PILOT.md)'), 'Hardening page links Partner Pilot', failures);
  check(hardening.includes('[Sales Close Kit](./SALES-CLOSE-KIT.md)'), 'Hardening page links Sales Close Kit', failures);
  check(hardening.includes('paid-hardening-inquiry.yml'), 'Hardening page links paid inquiry', failures);
  check(hardening.includes('Payment is due before implementation work starts'), 'Hardening page states payment-before-work', failures);

  check(partner.includes('Price: `$3,000`'), 'Partner page states $3,000 price', failures);
  check(partner.includes('One Partner Pilot covers one workflow and one repeated failure pattern'), 'Partner page scopes one workflow/failure', failures);
  check(partner.includes('A guarantee that every agent mistake is preventable'), 'Partner page excludes blanket guarantee', failures);
  check(partner.includes('Telemetry added to the open-source guard'), 'Partner page excludes added telemetry', failures);
  check(partner.includes('paid-hardening-inquiry.yml'), 'Partner page links paid inquiry', failures);
  check(partner.includes('Payment is due before implementation work starts'), 'Partner page states payment-before-work', failures);

  check(operatingPlan.includes('Bookings and calls do not count toward the revenue target until payment clears'), 'Operating plan requires cleared payment proof', failures);
  check(operatingPlan.includes('node tools/revenue-control-checks.js'), 'Operating plan documents revenue control checks', failures);
  check(operatingPlan.includes('node tools/proposal-batch-plan.js --date YYYY-MM-DD --include-backup'), 'Operating plan documents backup proposal batch command', failures);
  check(operatingPlan.includes('Backup handoffs are not extra revenue proof and must not be double-counted'), 'Operating plan prevents backup handoff double-counting', failures);
  check(closeKit.includes('Payment due before work starts'), 'Close kit states payment due before work', failures);
  check(closeKit.includes('Only cleared Stripe payments entered into the revenue ledger count as revenue proof'), 'Close kit requires cleared Stripe revenue proof', failures);

  check(paidIssue.includes('Partner Pilot ($3,000)'), 'Paid inquiry offers Partner Pilot route', failures);
  check(paidIssue.includes('Do **not** post secrets'), 'Paid inquiry warns against secrets', failures);
  check(paidIssue.includes('payment is due before implementation work starts'), 'Paid inquiry includes payment expectation', failures);
  check(paidIssue.includes('not a blanket guarantee'), 'Paid inquiry includes no-guarantee expectation', failures);
  check(freeIssue.includes('free guard tuning'), 'Free issue template routes free guard tuning', failures);
  check(freeIssue.includes('Do **not** post secrets'), 'Free issue template warns against secrets', failures);
  check(config.includes('Paid triage call'), 'Issue config has paid triage contact link', failures);
  check(config.includes('Private email'), 'Issue config has private email contact link', failures);

  console.log('');
  console.log(`Public conversion checks: ${failures.length === 0 ? 'PASS' : 'FAIL'}`);
  if (failures.length > 0) {
    process.exit(1);
  }
}

try {
  main();
} catch (error) {
  console.error(error.message);
  console.error('');
  console.error(usage);
  process.exit(2);
}
