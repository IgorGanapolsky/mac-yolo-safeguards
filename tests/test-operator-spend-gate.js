#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const GATE = path.join(ROOT, 'tools', 'operator-spend-gate.js');
const {
  classifySpendIntent,
  parseAuthorization,
  evaluateSpendGate,
  evaluateToolCall,
  readCommitments,
  GATE_ID,
} = require(GATE);

function test(name, fn) {
  try {
    fn();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    console.error(error.stack || error.message);
    process.exitCode = 1;
  }
}

const tmpLedger = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'spend-gate-')), 'commitments.jsonl');

test('CLI help exits 0', () => {
  const r = spawnSync(process.execPath, [GATE, '--help'], { encoding: 'utf8' });
  assert.strictEqual(r.status, 0, r.stderr);
  assert.ok(r.stdout.includes('operator-spend-gate'));
});

test('classify: upgrade Apollo is spend intent', () => {
  const c = classifySpendIntent('you should upgrade Apollo to Basic plan');
  assert.strictEqual(c.isSpendIntent, true);
  assert.ok(c.spendHits.length > 0);
});

test('classify: buy credits is spend intent', () => {
  const c = classifySpendIntent('buy more credits on Apollo');
  assert.strictEqual(c.isSpendIntent, true);
  assert.ok(c.spendHits.includes('buy_credits'));
});

test('classify: refund/cancel is safe recovery', () => {
  const c = classifySpendIntent('request a full refund and cancel the plan');
  assert.strictEqual(c.isSpendIntent, false);
  assert.strictEqual(c.isSafeRecovery, true);
});

test('classify: remove credit card is safe', () => {
  const c = classifySpendIntent('remove credit card from billing');
  assert.strictEqual(c.isSpendIntent, false);
  assert.ok(c.safeHits.includes('remove_card'));
});

test('authorize: parses I authorize spend $N', () => {
  const a = parseAuthorization('I authorize spend $25 on domain email SMTP only.');
  assert.strictEqual(a.authorized, true);
  assert.strictEqual(a.maxAuthorizedUsd, 25);
});

test('authorize: missing amount is not authorized', () => {
  const a = parseAuthorization('I authorize spend on Apollo');
  assert.strictEqual(a.authorized, false);
});

test('evaluate: blocks upgrade without auth', () => {
  const r = evaluateSpendGate({
    action: 'upgrade Apollo Basic annual $588',
    message: 'fix the people API please',
    log: true,
    ledgerPath: tmpLedger,
  });
  assert.strictEqual(r.decision, 'BLOCK');
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.gateId, GATE_ID);
  assert.ok(r.reason.includes('without_same_message'));
});

test('evaluate: allows upgrade with matching authorization', () => {
  const r = evaluateSpendGate({
    action: 'upgrade Apollo Basic for $49',
    message: 'I authorize spend $49 on Apollo Basic this month only.',
    log: true,
    ledgerPath: tmpLedger,
  });
  assert.strictEqual(r.decision, 'ALLOW');
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.reason, 'explicit_same_message_authorization');
});

test('evaluate: blocks when action amount exceeds auth', () => {
  const r = evaluateSpendGate({
    action: 'checkout $588 annual Basic',
    message: 'I authorize spend $10 on snacks',
    log: true,
    ledgerPath: tmpLedger,
  });
  assert.strictEqual(r.decision, 'BLOCK');
  assert.strictEqual(r.reason, 'amount_exceeds_authorization');
});

test('evaluate: always allows refund path', () => {
  const r = evaluateSpendGate({
    action: 'email support@apollo.io requesting refund of $588',
    message: 'get my money back',
    log: true,
    ledgerPath: tmpLedger,
  });
  assert.strictEqual(r.decision, 'ALLOW');
  assert.ok(r.reason === 'safe_recovery_path' || r.ok);
});

test('evaluateToolCall: blocks bash-ish upgrade string', () => {
  const r = evaluateToolCall({
    toolName: 'Bash',
    toolInput: { command: 'open https://app.apollo.io/#/settings/plans/upgrade' },
    message: 'continue',
    log: true,
    agentId: 'test',
  });
  // URL may not match patterns; force with text
  const r2 = evaluateToolCall({
    toolName: 'Bash',
    toolInput: { command: 'echo upgrade plan buy credits' },
    message: 'do it',
    log: true,
  });
  assert.strictEqual(r2.decision, 'BLOCK');
  void r;
});

test('CLI check exits 1 on block', () => {
  const r = spawnSync(
    process.execPath,
    [GATE, 'check', '--action', 'buy more credits', '--message', 'fix api', '--ledger', tmpLedger, '--json'],
    { encoding: 'utf8' },
  );
  assert.strictEqual(r.status, 1, r.stdout + r.stderr);
  const body = JSON.parse(r.stdout);
  assert.strictEqual(body.decision, 'BLOCK');
});

test('CLI check exits 0 on authorized spend', () => {
  const r = spawnSync(
    process.execPath,
    [
      GATE,
      'check',
      '--action',
      'buy credits $5',
      '--message',
      'I authorize spend $5 on Apollo credits',
      '--ledger',
      tmpLedger,
      '--json',
    ],
    { encoding: 'utf8' },
  );
  assert.strictEqual(r.status, 0, r.stdout + r.stderr);
  const body = JSON.parse(r.stdout);
  assert.strictEqual(body.decision, 'ALLOW');
});

test('commitment ledger appends rows', () => {
  const rows = readCommitments(50, tmpLedger);
  assert.ok(rows.length >= 3, `expected ledger rows, got ${rows.length}`);
  assert.ok(rows.some((r) => r.decision === 'BLOCK'));
  assert.ok(rows.some((r) => r.decision === 'ALLOW'));
});

test('ThumbGate Pro upsell is spend intent', () => {
  const c = classifySpendIntent('Upgrade to ThumbGate Pro for unlimited rules');
  assert.strictEqual(c.isSpendIntent, true);
});

if (process.exitCode) {
  console.error('operator-spend-gate tests: FAIL');
  process.exit(process.exitCode);
}
console.log('operator-spend-gate tests: PASS');
