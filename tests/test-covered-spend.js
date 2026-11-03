#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const lib = require(path.join(ROOT, 'tools', 'lib', 'covered-spend'));
const cli = path.join(ROOT, 'tools', 'covered-spend.js');
const MARKER = 'do-not-echo-this-phrase';

function runCli(args) {
  return spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8' });
}

let passed = 0;
function ok(name) {
  passed += 1;
  console.log(`ok ${passed} ${name}`);
}

const short = lib.judgeMeter({ kind: 'topup', quoteCents: 2500, collectedCents: 0 });
assert.strictEqual(short.effect, 'block');
assert.strictEqual(short.purchased, false);
assert.strictEqual(short.chargeCents, 0);
const covered = lib.judgeMeter({ kind: 'node', quoteCents: 2500, collectedCents: 2500 });
assert.strictEqual(covered.effect, 'hold');
assert.strictEqual(covered.purchased, false);
assert.strictEqual(lib.judgeMeter({ kind: 'job', quoteCents: 100, collectedCents: 50 }).effect, 'block');
assert.strictEqual(lib.judgeMeter({ kind: 'remote', quoteCents: 100, collectedCents: 500 }).effect, 'hold');
assert.strictEqual(lib.judgeMeter({ kind: 'topup', quoteCents: 1.5, collectedCents: 100 }).effect, 'refuse');
assert.strictEqual(lib.judgeMeter({ kind: 'topup', rate: true, quoteCents: 100, collectedCents: 100 }).effect, 'refuse');
ok('an uncovered quote is refused and a covered quote is still not bought');

const parked = lib.judgeMeter({ kind: 'park' });
assert.strictEqual(parked.effect, 'park');
assert.strictEqual(parked.chargeCents, 0);
assert.strictEqual(lib.judgeMeter({ kind: 'idle' }).effect, 'park');
assert.strictEqual(lib.judgeMeter({ kind: 'stop' }).chargeCents, 0);
ok('an idle meter is parked at no charge');

const sheet = lib.judgeMeter({
  kind: 'sell',
  listing: { source: 'measured', cents: 4900, url: 'https://example.invalid/mac-app' },
});
assert.strictEqual(sheet.effect, 'sell');
assert.strictEqual(sheet.product, 'Mac YOLO Safeguards');
assert.strictEqual(sheet.purchased, false);
assert.strictEqual(lib.judgeMeter({ kind: 'sell', listing: { source: 'claimed', cents: 4900, url: 'https://example.invalid/mac-app' } }).effect, 'refuse');
assert.strictEqual(lib.judgeMeter({ kind: 'sell', listing: { source: 'measured', cents: 4900, url: 'https://example.invalid/mac-app', hire: true } }).effect, 'refuse');
assert.strictEqual(lib.judgeMeter({ kind: 'other' }).effect, 'refuse');
ok('the sheet sells the Mac app and does not buy');

const banned = ['sfcompute', 'autoresearch', 'givemeanode', 'H100', 'ThumbGate', 'Dayglass', 'child_process', 'execSync', 'execFile', 'SIGKILL', 'SIGTERM', '330'];
for (const file of ['tools/lib/covered-spend.js', 'tools/covered-spend.js']) {
  const source = fs.readFileSync(path.join(ROOT, file), 'utf8');
  for (const word of banned) assert.ok(!source.includes(word), `${file} contains ${word}`);
  assert.ok(!source.includes('Gumroad page'));
}
assert.ok(!Object.keys(lib).some((name) => /send|buy|pay|topup|purchase|mint|fork/i.test(name)));
ok('the check does not buy compute or name a vendor');

const uncovered = runCli(['spend', '--kind', 'topup', '--quote-cents', '2500', '--collected-cents', '0']);
assert.strictEqual(uncovered.status, 77);
assert.match(uncovered.stdout, /^Refused\. Collected cash does not cover the quote/);
assert.ok(!uncovered.stdout.includes('2500'));

const held = runCli(['spend', '--kind', 'node', '--quote-cents', '2500', '--collected-cents', '9000']);
assert.strictEqual(held.status, 75);
assert.match(held.stdout, /^Held\. The quote is covered\. Nothing was bought/);
assert.ok(!held.stdout.includes('9000'));
assert.ok(!held.stdout.includes('2500'));

const rated = runCli(['spend', '--kind', 'topup', '--rate', '4242']);
assert.strictEqual(rated.status, 77);
assert.match(rated.stdout, /^Refused\. That rate is not a local measurement/);
assert.ok(!rated.stdout.includes('4242'));

const idle = runCli(['park']);
assert.strictEqual(idle.status, 0);
assert.match(idle.stdout, /^Admitted\. An idle meter is parked/);
assert.match(idle.stdout, /charge=0 purchased=false/);

const sold = runCli(['sell', '--cents', '4900', '--url', 'https://example.invalid/mac-app', '--source', 'measured']);
assert.strictEqual(sold.status, 0);
assert.match(sold.stdout, /^Admitted\. Sell the Mac app\. Nothing was bought/);
assert.match(sold.stdout, /Mac YOLO Safeguards purchased=false sent=false calls=0/);
assert.ok(!sold.stdout.includes('4900'));

const foreign = runCli(['sell', '--cents', '4900', '--url', `https://example.invalid/${MARKER}`, '--source', 'claimed']);
assert.strictEqual(foreign.status, 77);
assert.match(foreign.stdout, /^Refused\. The price was not measured/);
assert.ok(!foreign.stdout.includes(MARKER));

const usage = runCli(['spend']);
assert.strictEqual(usage.status, 2);
ok('the command refuses a top-up and does not echo the quote');

console.log(`passed ${passed}`);
