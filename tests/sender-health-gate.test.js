'use strict';

// Review on #1315: "nothing reads coordination/sender-health.json ... the failure mode
// motivating this change can still burn prospects." A verdict nobody consults is not a
// gate. On 2026-07-29 five prospects were consumed while every send bounced and the
// ledger recorded them as sent — you get one first email per person, so a bounced send
// is a lost contact, not a retry.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { checkSender, STALE_AFTER_MS } = require('../tools/sender-health.js');

function repoWith(senders) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'shg-'));
  fs.mkdirSync(path.join(dir, 'coordination'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'coordination', 'sender-health.json'),
    JSON.stringify({ senders }, null, 2));
  return dir;
}

test('a sender proven not to deliver is BLOCKED', () => {
  const root = repoWith({
    'igor@igorganapolsky.com': {
      status: 'blocked', verdict: 'DOMAIN_BROKEN',
      checkedAt: new Date().toISOString(), detail: 'zone deleted',
    },
  });
  const r = checkSender('igor@igorganapolsky.com', { repoRoot: root });
  assert.equal(r.allowed, false);
  assert.equal(r.status, 'blocked');
  assert.match(r.reason, /DOMAIN_BROKEN/, 'must say why, so the operator can act');
  fs.rmSync(root, { recursive: true, force: true });
});

test('a freshly proven sender is allowed — the gate is not vacuous', () => {
  const root = repoWith({
    'ok@example.com': { status: 'ok', verdict: 'OK', checkedAt: new Date().toISOString() },
  });
  const r = checkSender('ok@example.com', { repoRoot: root });
  assert.equal(r.allowed, true);
  assert.equal(r.status, 'ok');
  fs.rmSync(root, { recursive: true, force: true });
});

test('an UNKNOWN sender warns but does not deadlock the loop', () => {
  // Blocking on unknown would stop all sending the first time a new address appears,
  // and a guard that halts normal work gets switched off.
  const root = repoWith({});
  const r = checkSender('brand-new@example.com', { repoRoot: root });
  assert.equal(r.allowed, true);
  assert.equal(r.status, 'unknown');
  assert.match(r.reason, /smtp-auth-check/, 'must name the command that resolves it');
  fs.rmSync(root, { recursive: true, force: true });
});

test('a stale verdict is flagged — seven bounces arrived 4 seconds after sending', () => {
  const root = repoWith({
    'old@example.com': {
      status: 'ok', verdict: 'OK',
      checkedAt: new Date(Date.now() - STALE_AFTER_MS - 60000).toISOString(),
    },
  });
  const r = checkSender('old@example.com', { repoRoot: root });
  assert.equal(r.status, 'stale', 'yesterday\'s proof is not today\'s proof');
  assert.equal(r.allowed, true, 'stale warns, it does not block');
  fs.rmSync(root, { recursive: true, force: true });
});

test('a missing health file does not block sending', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'shg-none-'));
  const r = checkSender('someone@example.com', { repoRoot: dir });
  assert.equal(r.allowed, true);
  assert.equal(r.status, 'unknown');
  fs.rmSync(dir, { recursive: true, force: true });
});

test('the send gate actually consults sender health', () => {
  // The whole finding: writing a verdict nobody reads changes nothing.
  const loop = fs.readFileSync(path.join(__dirname, '..', 'tools', 'revenue-autonomous-loop.js'), 'utf8');
  assert.match(loop, /require\('\.\/sender-health'\)\.checkSender\(/,
    'the loop must read the sender health verdict');
  assert.match(loop, /senderHealth\.allowed;/,
    'and unattendedSendAllowed must depend on it');
  const gate = loop.slice(loop.indexOf('const unattendedSendAllowed'), loop.indexOf('const unattendedSendAllowed') + 400);
  assert.match(gate, /senderHealth\.allowed/,
    'the dependency must be inside the gate expression, not merely computed nearby');
});
