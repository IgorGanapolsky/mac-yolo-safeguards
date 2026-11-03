#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const lib = require(path.join(ROOT, 'tools', 'lib', 'reply-block'));
const cli = path.join(ROOT, 'tools', 'reply-block.js');

function at(hour, minute) {
  return new Date(2026, 10, 3, hour, minute, 0, 0);
}

function runCli(args) {
  return spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8' });
}

const blank = '## Override\nchronotype:\nzone:\ntrough: 14:00-16:00\n';
const estimateOnly = '## Estimate\nzone: 09:00-12:00\n## Override\nzone:\n';
const declared = '## Override\nzone: 16:00-21:00\n';

let passed = 0;
function ok(name) {
  passed += 1;
  console.log(`ok ${passed} ${name}`);
}

assert.strictEqual(lib.judge('email', blank, at(17, 0)).effect, 'admit');
assert.strictEqual(lib.judge('email', estimateOnly, at(10, 0)).effect, 'admit');
assert.match(lib.judge('slack', '', at(10, 0)).reason, /No offline window is declared/);
ok('a blank override and the drawing clock do not start a window');

const during = lib.judge('email', declared, at(17, 0));
assert.strictEqual(during.effect, 'defer');
assert.match(during.reason, /Messages wait until the window ends/);
assert.strictEqual(lib.judge('slack post', declared, at(16, 30)).effect, 'defer');
assert.strictEqual(lib.judge('email', declared, at(19, 0)).effect, 'admit');
assert.strictEqual(lib.judge('email', declared, at(15, 59)).effect, 'admit');
ok('a declared window holds messages for three hours and then lets them through');

assert.strictEqual(lib.judge('mac yolo listing', declared, at(17, 0)).effect, 'admit');
assert.strictEqual(lib.judge('app store lookup', declared, at(17, 0)).effect, 'admit');
assert.strictEqual(lib.judge('outage', declared, at(17, 0)).effect, 'admit');
assert.strictEqual(lib.judge('security email', declared, at(17, 0)).effect, 'admit');
assert.strictEqual(lib.judge('direct request', declared, at(17, 0)).effect, 'admit');
assert.strictEqual(lib.judge('mystery task', declared, at(17, 0)).effect, 'defer');
assert.strictEqual(lib.judge('mystery task', blank, at(17, 0)).effect, 'admit');
ok('the listing check and an outage still run, and unknown work waits only inside the window');

assert.strictEqual(lib.acceptMeasurement({ minutes: 0, source: 'email', illustration: true }), false);
assert.strictEqual(lib.acceptMeasurement({ minutes: 155, source: 'email', illustration: true }), false);
assert.strictEqual(lib.acceptMeasurement({ minutes: 40, source: 'guess' }), false);
assert.strictEqual(lib.acceptMeasurement({ minutes: 40, source: 'measured' }), true);
ok('an illustration is not a measurement');

const banned = ['FlowState', 'Rían', 'Doris', '2 hr 35', '0 min in flow', 'child_process', 'SIGKILL', 'SIGTERM'];
for (const file of ['tools/lib/reply-block.js', 'tools/reply-block.js']) {
  const source = fs.readFileSync(path.join(ROOT, file), 'utf8');
  for (const word of banned) {
    assert.ok(!source.includes(word), `${file} contains ${word}`);
  }
}
assert.ok(!Object.keys(lib).some((name) => /send|buy|post|mail/i.test(name)));
ok('the check has no send path and no course name');

const deferred = runCli(['check', '--action', 'email', '--window', '16:00-21:00', '--at', '17:00']);
assert.strictEqual(deferred.status, 75);
assert.match(deferred.stdout, /^Deferred email\. Messages wait/);

const admitted = runCli(['check', '--action', 'email', '--at', '17:00']);
assert.strictEqual(admitted.status, 0);
assert.match(admitted.stdout, /No offline window is declared/);

const listing = runCli(['check', '--action', 'mac yolo listing', '--window', '16:00-21:00', '--at', '17:00']);
assert.strictEqual(listing.status, 0);
assert.match(listing.stdout, /grows the business/);

const usage = runCli([]);
assert.strictEqual(usage.status, 2);
ok('the command exits 75 to hold a message and 0 to let the listing check run');

console.log(`passed ${passed}`);
