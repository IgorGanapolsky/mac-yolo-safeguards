#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const lib = require(path.join(ROOT, 'tools', 'lib', 'account-gate'));
const cli = path.join(ROOT, 'tools', 'account-gate.js');

const OWNER = 'IgorGanapolsky';
const OTHER = 'iganapolsky';
const NOW = new Date('2026-11-03T16:00:00Z');
const LATER = '2026-11-03T17:00:00Z';
const EARLIER = '2026-11-03T15:59:59Z';
const SECRET = 'x'.repeat(40);

function runCli(args) {
  return spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8' });
}

let passed = 0;
function ok(name) {
  passed += 1;
  console.log(`ok ${passed} ${name}`);
}

assert.strictEqual(lib.judgeAccount(OTHER, OWNER, 'write').effect, 'block');
assert.match(lib.judgeAccount(OTHER, OWNER, 'write').reason, /repo owner's account/);
assert.strictEqual(lib.judgeAccount('igorganapolsky', OWNER, 'write').effect, 'admit');
assert.strictEqual(lib.judgeAccount(OWNER, OWNER, 'write').effect, 'admit');
assert.strictEqual(lib.judgeAccount('', OWNER, 'write').effect, 'block');
assert.strictEqual(lib.judgeAccount(SECRET, OWNER, 'write').effect, 'block');
ok('a write proceeds only when the acting account is the repo owner');

assert.strictEqual(lib.judgeAccount(OTHER, OWNER, 'read').effect, 'admit');
assert.strictEqual(lib.judgeAccount(OWNER, OWNER, 'share').effect, 'block');
assert.match(lib.judgeAccount(OWNER, OWNER, 'share').reason, /stays on the account/);
assert.strictEqual(lib.judgeAccount(OTHER, OWNER, 'publish').effect, 'block');
ok('a read can use either account, and a connection is never copied');

assert.strictEqual(lib.judgeHandoff('listing-check', 'read', LATER, NOW).effect, 'admit');
assert.strictEqual(lib.judgeHandoff('listing-check', 'edit', LATER, NOW).effect, 'admit');
assert.strictEqual(lib.judgeHandoff('listing-check', 'test', LATER, NOW).effect, 'admit');
assert.strictEqual(lib.judgeHandoff('listing-check', 'send', LATER, NOW).effect, 'refuse');
assert.strictEqual(lib.judgeHandoff('listing-check', 'pay', LATER, NOW).effect, 'refuse');
assert.strictEqual(lib.judgeHandoff('listing-check', 'read', NOW.toISOString(), NOW).effect, 'refuse');
assert.strictEqual(lib.judgeHandoff('listing-check', 'read', EARLIER, NOW).effect, 'refuse');
assert.strictEqual(lib.judgeHandoff('', 'read', LATER, NOW).effect, 'refuse');
assert.strictEqual(lib.judgeHandoff(SECRET, 'read', LATER, NOW).effect, 'refuse');
ok('a handoff admits read, edit, or test only while it is still current');

const enabled = NOW.toISOString();
assert.strictEqual(lib.judgeAudit({ kind: 'session', ts: enabled }, enabled).effect, 'admit');
assert.strictEqual(lib.judgeAudit({ kind: 'membership', ts: LATER }, enabled).effect, 'admit');
assert.strictEqual(lib.judgeAudit({ kind: 'session', ts: EARLIER }, enabled).effect, 'refuse');
assert.match(lib.judgeAudit({ kind: 'session', ts: EARLIER }, enabled).reason, /before enablement/);
assert.strictEqual(lib.judgeAudit({ kind: 'billing', ts: LATER }, enabled).effect, 'refuse');
assert.strictEqual(lib.judgeAudit({ kind: 'session', ts: LATER, price: 4900 }, enabled).effect, 'refuse');
assert.strictEqual(lib.judgeAudit({ kind: 'session', ts: LATER, pricing: true }, enabled).effect, 'refuse');
assert.strictEqual(lib.judgeAudit({ kind: 'session', ts: LATER, illustration: true }, enabled).effect, 'refuse');
ok('an audit event starts at enablement, and a price is refused');

const banned = ['WorkOS', 'AuthKit', 'Passport', 'Atlas', 'Pipes', 'Cyber60', 'child_process', 'SIGKILL', 'SIGTERM'];
for (const file of ['tools/lib/account-gate.js', 'tools/account-gate.js']) {
  const source = fs.readFileSync(path.join(ROOT, file), 'utf8');
  for (const word of banned) {
    assert.ok(!source.includes(word), `${file} contains ${word}`);
  }
}
assert.ok(!Object.keys(lib).some((name) => /send|buy|pay|mint|share/i.test(name)));
ok('the check has no vendor name and no send path');

const wrongWriter = runCli(['account', '--login', OTHER, '--owner', OWNER, '--action', 'write']);
assert.strictEqual(wrongWriter.status, 77);
assert.match(wrongWriter.stdout, /^Blocked write\. A write uses the repo owner's account\./);
assert.ok(!wrongWriter.stdout.includes(OTHER));
assert.ok(!wrongWriter.stdout.includes(OWNER));

const ownerWriter = runCli(['account', '--login', OWNER, '--owner', OWNER, '--action', 'write']);
assert.strictEqual(ownerWriter.status, 0);
assert.match(ownerWriter.stdout, /^Admitted write\. The acting account is the repo owner\./);

const shared = runCli(['account', '--login', OWNER, '--owner', OWNER, '--action', 'share']);
assert.strictEqual(shared.status, 77);
assert.match(shared.stdout, /connection stays on the account/);

const secretRead = runCli(['account', '--login', SECRET, '--owner', OWNER, '--action', 'read']);
assert.strictEqual(secretRead.status, 77);
assert.ok(!secretRead.stdout.includes(SECRET));
assert.ok(!secretRead.stderr.includes(SECRET));

const handoff = runCli(['handoff', '--target', 'listing-check', '--scope', 'read', '--expires', LATER, '--at', enabled]);
assert.strictEqual(handoff.status, 0);
assert.match(handoff.stdout, /^Admitted read\. The handoff is inside its scope/);

const sendScope = runCli(['handoff', '--target', 'listing-check', '--scope', 'send', '--expires', LATER, '--at', enabled]);
assert.strictEqual(sendScope.status, 77);
assert.match(sendScope.stdout, /^Refused send\. That scope is outside the handoff/);

const priced = runCli(['audit', '--kind', 'session', '--at', LATER, '--enabled', enabled, '--price', '4900']);
assert.strictEqual(priced.status, 77);
assert.match(priced.stdout, /A price is not a measurement/);
assert.ok(!priced.stdout.includes('4900'));

const early = runCli(['audit', '--kind', 'session', '--at', EARLIER, '--enabled', enabled]);
assert.strictEqual(early.status, 77);
assert.match(early.stdout, /before enablement/);

const usage = runCli([]);
assert.strictEqual(usage.status, 2);
ok('the command blocks the other account, a copied connection, and a priced event');

console.log(`passed ${passed}`);
