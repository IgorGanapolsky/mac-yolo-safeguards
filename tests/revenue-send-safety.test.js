'use strict';

// Four defects in the unattended-send path, all of which end the same way: a prospect
// who already replied receives a cold follow-up. That happened for real — someone
// replied 2026-07-22 and got another cold "$499" follow-up on 07-28.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const LOOP = fs.readFileSync(path.join(__dirname, '..', 'tools', 'revenue-autonomous-loop.js'), 'utf8');
const RALPH = fs.readFileSync(path.join(__dirname, '..', 'tools', 'ralph-gsd-loop.js'), 'utf8');

test('skipping the reply scan is always blind, whatever the reason', () => {
  // `replyScanBlind = !args.fast` claimed fast mode was not blind because it "never
  // sends" — but ralph-gsd-loop.js invokes this with `--auto-send --fast`, so the
  // hard-stop was bypassed on precisely the path that mails people.
  assert.ok(!/replyScanBlind\s*=\s*!args\.fast/.test(LOOP),
    'fast mode must not be treated as sighted after skipping the scan');
  assert.match(LOOP, /replyScanBlind = true;/,
    'the skip branch must mark the run blind');
});

test('a sending run cannot skip the reply scan', () => {
  assert.match(LOOP, /!args\.fast \|\| args\.autoSend/,
    'the scan gate must run whenever --auto-send is set, even under --fast');
});

test('ralph still passes --fast, so the above is load-bearing', () => {
  // If this ever stops being true the tests above become theoretical; assert the
  // caller, not just the callee.
  assert.match(RALPH, /'--auto-send'/, 'ralph must still request auto-send');
  assert.match(RALPH, /'--fast'/, 'ralph must still pass --fast');
});

test('the exclusion set survives past the cycle that first saw the reply', () => {
  // The scanner's `hot` array is notification-only: it marks seen[id] on first sight
  // and skips it afterwards, so building the exclusion set from `hot` alone excluded
  // a replier exactly once.
  // Match the USE, not the definition — `/loadRepliedContacts\(\)/` alone also matched
  // `function loadRepliedContacts()`, so deleting the call site still passed.
  assert.match(LOOP, /for \(const email of loadRepliedContacts\(\)\) repliedEmails\.add\(email\);/,
    'durable replied contacts must actually be folded into the exclusion set');
  assert.match(LOOP, /if \(repliedEmails\.size\) saveRepliedContacts\(repliedEmails\);/,
    'replies seen this cycle must be persisted for later cycles');
});

test('ralph counts cleared payments from the ledger that is actually written', () => {
  // ralph read cleared-payments-<day>.jsonl, which nothing writes. The canonical
  // ledger is revenue-ledger-YYYY-MM.tsv from tools/record-cleared-payment.js. So a
  // real payment never incremented `paid`, the goal never closed, and revenue was
  // forced every 30 minutes forever.
  assert.match(RALPH, /revenue-ledger-/,
    'ralph must read the canonical TSV ledger');
  assert.match(RALPH, /date_paid/, 'must filter the ledger by paid date');
  assert.match(RALPH, /\['paid', 'cleared'\]/, 'must count both paid and cleared rows');
});

test('the canonical ledger writer and reader agree on the filename', () => {
  const writer = fs.readFileSync(
    path.join(__dirname, '..', 'tools', 'record-cleared-payment.js'), 'utf8');
  assert.match(writer, /revenue-ledger-/,
    'writer must still use revenue-ledger-*; if it moves, ralph must move with it');
});
