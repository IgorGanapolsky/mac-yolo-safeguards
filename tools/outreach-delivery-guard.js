#!/usr/bin/env node
'use strict';

/**
 * Outreach delivery guard.
 *
 * Observed 2026-07-31: 34 mailer-daemon DSNs in 30 days, in two distinct classes,
 * and nothing in the send path looked at either of them before sending again.
 *
 *   A. address_not_found  — 550 5.1.1 on guessed role addresses
 *      (hello@factory.ai, team@galileo.ai, hello@all-hands.dev,
 *       hello@llamaindex.ai, hello@crewai.com — 5 of 10 sends on 2026-07-31)
 *
 *   B. sender_alias_misconfigured — every send from igor@igorganapolsky.com on
 *      2026-07-29 failed with "You're sending this from a different address or
 *      alias using the 'Send mail as' feature. The settings ... are misconfigured
 *      or out of date." Six well-targeted, personalized emails to named humans
 *      were silently never delivered. A probe on 2026-07-30 failed the same way.
 *
 * Class B is the dangerous one: the send path reports SENT, the DSN arrives
 * separately, and the pipeline records a "sent" row for a message nobody received.
 *
 * This guard is fail-closed preflight. It does not send anything.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

const LEDGER_PATH = process.env.OUTREACH_LEDGER
  || path.join(os.homedir(), '.hermes/receipts/outreach/delivery-ledger.json');

/** Role addresses are guessed, not verified — they are where class A bounces come from. */
const ROLE_LOCALPARTS = new Set([
  'hello', 'support', 'info', 'contact', 'team', 'sales', 'admin',
  'press', 'help', 'founders', 'careers', 'hi', 'mail',
]);

const ALIAS_STALE_DAYS = 14;

function classifyDsn(text) {
  const body = String(text || '');
  if (/'Send mail as'|Send mail as|alias .* misconfigured|misconfigured or out of date/i.test(body)) {
    return 'sender_alias_misconfigured';
  }
  if (/550[\s-]*5\.1\.1|Address not found|address couldn't be found|couldn’t be found|user unknown|mailbox (?:unavailable|missing)/i.test(body)) {
    return 'address_not_found';
  }
  return 'other';
}

function isRoleAddress(email) {
  const local = String(email || '').split('@')[0].toLowerCase().trim();
  return ROLE_LOCALPARTS.has(local);
}

function emptyLedger() {
  return { schema: 'outreach-delivery-ledger/v1', hardBounced: {}, aliases: {} };
}

function readLedger(file = LEDGER_PATH) {
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    return { ...emptyLedger(), ...parsed };
  } catch {
    return emptyLedger();
  }
}

function writeLedger(ledger, file = LEDGER_PATH) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(ledger, null, 2)}\n`, { mode: 0o600 });
  return file;
}

/**
 * Fold DSN observations into a ledger.
 * @param {object} ledger
 * @param {Array} records [{kind, recipient, alias, at}]
 */
function recordDsns(ledger, records) {
  const next = { ...emptyLedger(), ...ledger };
  next.hardBounced = { ...next.hardBounced };
  next.aliases = { ...next.aliases };
  for (const r of records || []) {
    if (!r || !r.kind) continue;
    if (r.kind === 'address_not_found' && r.recipient) {
      next.hardBounced[r.recipient.toLowerCase()] = { at: r.at || null, kind: r.kind };
    }
    if (r.kind === 'sender_alias_misconfigured' && r.alias) {
      const key = r.alias.toLowerCase();
      const prev = next.aliases[key] || { failures: 0, lastFailureAt: null, lastSuccessAt: null };
      next.aliases[key] = {
        ...prev,
        failures: prev.failures + 1,
        lastFailureAt: r.at || prev.lastFailureAt,
      };
    }
  }
  return next;
}

/** Record that an alias actually delivered — the only thing that clears it. */
function recordAliasSuccess(ledger, alias, at) {
  const next = { ...emptyLedger(), ...ledger, aliases: { ...(ledger.aliases || {}) } };
  const key = String(alias).toLowerCase();
  const prev = next.aliases[key] || { failures: 0, lastFailureAt: null, lastSuccessAt: null };
  next.aliases[key] = { ...prev, lastSuccessAt: at, failures: 0 };
  return next;
}

function daysBetween(a, b) {
  return Math.abs(new Date(a).getTime() - new Date(b).getTime()) / 86400000;
}

/**
 * Fail-closed preflight. Returns [] when the send is safe.
 *
 * @param {object} input
 * @param {string} input.from        sending alias
 * @param {string[]} input.to        recipients
 * @param {object} input.ledger
 * @param {string} input.now         ISO timestamp
 * @param {boolean} [input.allowRoleAddress] explicit opt-in for guessed role addresses
 */
function preflight({ from, to, ledger, now, allowRoleAddress = false }) {
  const violations = [];
  const l = { ...emptyLedger(), ...(ledger || {}) };

  const alias = l.aliases[String(from || '').toLowerCase()];
  if (alias) {
    // An alias is only cleared by a delivery observed AFTER its latest failure.
    // Checked independently of the failure counter: recordAliasSuccess() resets that
    // counter to 0, so gating the staleness branch on `failures > 0` made it dead code.
    const cleared = Boolean(alias.lastSuccessAt)
      && (!alias.lastFailureAt || new Date(alias.lastSuccessAt) > new Date(alias.lastFailureAt));
    if (alias.failures > 0 && !cleared) {
      violations.push(`from ${from}: alias has ${alias.failures} unresolved delivery failure(s) (last ${alias.lastFailureAt}) — messages report SENT but are never delivered`);
    } else if (cleared && now && daysBetween(now, alias.lastSuccessAt) > ALIAS_STALE_DAYS) {
      violations.push(`from ${from}: last verified delivery was ${Math.round(daysBetween(now, alias.lastSuccessAt))}d ago — re-probe before a batch`);
    }
  }

  for (const recipient of to || []) {
    const key = String(recipient).toLowerCase();
    if (l.hardBounced[key]) {
      violations.push(`to ${recipient}: previously hard-bounced (${l.hardBounced[key].at || 'unknown date'}) — re-sending damages sender reputation`);
      continue;
    }
    if (!allowRoleAddress && isRoleAddress(recipient)) {
      violations.push(`to ${recipient}: guessed role address, not a verified human — 5 of 10 such sends hard-bounced on 2026-07-31`);
    }
  }
  return violations;
}

function parseArgs(argv) {
  const args = { command: null, from: null, to: [], allowRoleAddress: false, json: false, file: LEDGER_PATH, help: false };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === 'check' || a === 'show') args.command = a;
    else if (a === '--from') { args.from = argv[i + 1]; i += 1; }
    else if (a === '--to') {
      while (argv[i + 1] && !argv[i + 1].startsWith('--')) { args.to.push(argv[i + 1]); i += 1; }
    } else if (a === '--allow-role-address') args.allowRoleAddress = true;
    else if (a === '--ledger') { args.file = argv[i + 1]; i += 1; }
    else if (a === '--json') args.json = true;
    else if (a === '--help' || a === '-h') args.help = true;
    else throw new Error(`Unknown argument: ${a}`);
  }
  return args;
}

function main(argv) {
  const args = parseArgs(argv);
  if (args.help || !args.command) {
    console.log('Usage: node tools/outreach-delivery-guard.js check --from <alias> --to <addrs...> [--allow-role-address] [--json]');
    console.log('       node tools/outreach-delivery-guard.js show [--json]');
    return args.help ? 0 : 2;
  }
  const ledger = readLedger(args.file);
  if (args.command === 'show') {
    const summary = {
      ledger: args.file,
      hardBounced: Object.keys(ledger.hardBounced || {}).length,
      aliases: ledger.aliases || {},
    };
    console.log(args.json ? JSON.stringify(summary, null, 2) : JSON.stringify(summary, null, 2));
    return 0;
  }
  const violations = preflight({
    from: args.from,
    to: args.to,
    ledger,
    now: new Date().toISOString(),
    allowRoleAddress: args.allowRoleAddress,
  });
  if (args.json) {
    console.log(JSON.stringify({ from: args.from, to: args.to, violations }, null, 2));
    return violations.length ? 1 : 0;
  }
  if (!violations.length) {
    console.log(`✓ delivery preflight clean (${args.to.length} recipient(s))`);
    return 0;
  }
  console.error('✗ delivery preflight failed:');
  violations.forEach((v) => console.error(`  - ${v}`));
  return 1;
}

if (require.main === module) {
  try {
    process.exit(main(process.argv.slice(2)));
  } catch (error) {
    console.error(`✗ ${error.message}`);
    process.exit(2);
  }
}

module.exports = {
  classifyDsn,
  isRoleAddress,
  recordDsns,
  recordAliasSuccess,
  preflight,
  readLedger,
  writeLedger,
  emptyLedger,
  parseArgs,
  LEDGER_PATH,
};
