#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const lib = require(path.join(ROOT, 'tools', 'lib', 'owned-offer'));
const cli = path.join(ROOT, 'tools', 'owned-offer.js');
const MARKER = 'do-not-echo-this-phrase';
const URL = 'https://iganapolsky.gumroad.com/l/nllmvb';

function runCli(args, env) {
  return spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8', env: { ...process.env, ...env } });
}

let passed = 0;
function ok(name) {
  passed += 1;
  console.log(`ok ${passed} ${name}`);
}

const motion = `free pilot, call 50 people, fork the repo, orgo, agent mail, agent phone, composio ${MARKER}`;
const blocked = lib.judgeOffer(motion, { cents: 4900, url: URL, source: 'measured' });
assert.strictEqual(blocked.effect, 'sell');
assert.deepStrictEqual(blocked.blocked, ['free-pilot', 'rented-stack', 'call-list']);
assert.strictEqual(blocked.customUsd, null);
assert.strictEqual(blocked.callsPlaced, 0);
assert.strictEqual(blocked.outboundUsd, 0);
assert.strictEqual(blocked.sent, false);
ok('a free pilot, a call list, and a rented stack still sell the Mac app');

const paid = lib.judgeOffer('sell the owned system', { cents: 4900, url: URL, source: 'measured', paid: true });
assert.strictEqual(paid.effect, 'sell');
assert.strictEqual(paid.customUsd, 25000);
assert.deepStrictEqual(paid.payments, [12500, 12500]);
assert.strictEqual(paid.windowDays, 30);
assert.strictEqual(paid.retainerUsd, 3000);
ok('a paid Mac app opens the custom quote');

assert.strictEqual(lib.judgeOffer('sell', { cents: 4900, url: URL, source: 'measured', hire: true }).effect, 'refuse');
assert.strictEqual(lib.judgeOffer('sell', { cents: 4900, url: URL, source: 'measured', illustration: true }).effect, 'refuse');
assert.strictEqual(lib.judgeOffer('sell', { cents: 4900, url: URL, source: 'measured', episode: true }).effect, 'refuse');
assert.strictEqual(lib.judgeOffer('sell', { cents: 4900, url: 'http://example.com', source: 'measured' }).effect, 'refuse');
assert.strictEqual(lib.listingOk({ cents: 4900, url: URL, source: 'measured' }), true);
ok('a hire figure or an illustration is not a measured price');

const banned = ['child_process', 'SIGKILL', 'SIGTERM', 'execFile', 'Gumroad page', '50000', '70000'];
for (const file of ['tools/lib/owned-offer.js', 'tools/owned-offer.js']) {
  const source = fs.readFileSync(path.join(ROOT, file), 'utf8');
  for (const word of banned) assert.ok(!source.includes(word), `${file} contains ${word}`);
}
assert.ok(!Object.keys(lib).some((name) => /send|buy|pay|mint|fork/i.test(name)));
ok('the check does not send, rent, or record a hire cost');

const sheet = runCli(['quote', '--cents', '4900', '--url', URL, '--source', 'measured', '--motion', motion]);
assert.strictEqual(sheet.status, 0);
assert.match(sheet.stdout, /^Sell\. Sell the Mac app/);
assert.match(sheet.stdout, /Blocked: free-pilot, rented-stack, call-list/);
assert.match(sheet.stdout, /Mac YOLO Safeguards, \$49\./);
assert.match(sheet.stdout, /Custom build: waiting/);
assert.ok(!sheet.stdout.includes(MARKER));
assert.ok(!sheet.stdout.includes('Bops'));

const quoted = runCli(['quote', '--cents', '4900', '--url', URL, '--source', 'measured', '--paid']);
assert.strictEqual(quoted.status, 0);
assert.match(quoted.stdout, /\$25,000 in two payments of \$12,500 and \$12,500/);

const hire = runCli(['quote', '--cents', '4900', '--url', URL, '--source', 'measured', '--hire']);
assert.strictEqual(hire.status, 77);
assert.match(hire.stdout, /^Refused\. The price was not measured/);
assert.ok(!hire.stdout.includes('70000'));
assert.ok(!hire.stdout.includes('50000'));

const home = fs.mkdtempSync(path.join(os.tmpdir(), 'owned-offer-'));
const written = runCli(
  ['quote', '--cents', '4900', '--url', URL, '--source', 'measured', '--write'],
  { OFFER_HOME: home },
);
assert.strictEqual(written.status, 0);
const draftLine = written.stdout.split('\n').find((line) => line.startsWith('draft='));
const draftPath = draftLine.slice('draft='.length);
assert.ok(fs.existsSync(draftPath));
assert.ok(fs.readFileSync(draftPath, 'utf8').includes('Not sent.'));

const usage = runCli(['quote']);
assert.strictEqual(usage.status, 2);
ok('the command prints the sheet and does not echo the request');

console.log(`passed ${passed}`);
