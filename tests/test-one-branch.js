#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const lib = require(path.join(ROOT, 'tools', 'lib', 'one-branch'));
const cli = path.join(ROOT, 'tools', 'one-branch.js');
const MARKER = 'do-not-echo-this-phrase';

function runCli(args) {
  return spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8' });
}

let passed = 0;
function ok(name) {
  passed += 1;
  console.log(`ok ${passed} ${name}`);
}

assert.strictEqual(lib.judgeArgs(['git', 'push', '-u', 'origin', 'HEAD'], 'matching').effect, 'allow');
assert.strictEqual(lib.judgeArgs(['git', 'push'], 'simple').effect, 'allow');
assert.strictEqual(lib.judgeArgs(['git', 'push'], 'current').effect, 'allow');
assert.strictEqual(lib.judgeArgs(['git', 'push'], 'upstream').effect, 'allow');
assert.strictEqual(lib.judgeArgs(['git', 'push', 'origin'], 'matching').effect, 'allow');
assert.strictEqual(lib.judgeArgs(['git', 'push', '--', 'origin', 'HEAD'], 'simple').effect, 'allow');
ok('one refspec is allowed');

assert.strictEqual(lib.judgeArgs(['git', 'push'], 'matching').effect, 'block');
assert.strictEqual(lib.judgeArgs(['git', 'push'], 'other').effect, 'block');
assert.strictEqual(lib.judgeArgs(['git', 'push'], undefined).effect, 'refuse');
assert.strictEqual(lib.judgeArgs(['git', 'push', '--all'], 'simple').effect, 'block');
assert.strictEqual(lib.judgeArgs(['git', 'push', '--mirror'], 'simple').effect, 'block');
assert.strictEqual(lib.judgeArgs(['git', 'push', '--tags'], 'simple').effect, 'block');
assert.strictEqual(lib.judgeArgs(['git', 'push', 'origin', 'refs/heads/*'], 'simple').effect, 'block');
assert.strictEqual(lib.judgeArgs(['git', 'push', 'origin', 'a', 'b'], 'simple').effect, 'block');
assert.strictEqual(lib.judgeArgs('git push', 'simple').effect, 'refuse');
ok('every-ref pushes are blocked');

assert.strictEqual(lib.acceptListing({ source: 'measured', scope: 'trunk', refs: 1, bytes: 40 }), true);
assert.strictEqual(lib.acceptListing({ source: 'measured', scope: 'trunk', refs: 0, bytes: 0 }), true);
assert.strictEqual(lib.acceptListing({ source: 'measured', scope: 'every-ref', refs: 1, bytes: 40 }), false);
assert.strictEqual(lib.acceptListing({ source: 'measured', scope: 'trunk', refs: 1, bytes: 40, speedup: true }), false);
assert.strictEqual(lib.acceptListing({ source: 'measured', scope: 'trunk', refs: 1.5, bytes: 40 }), false);
assert.strictEqual(lib.acceptListing({ source: 'model', scope: 'trunk', refs: 1, bytes: 40 }), false);
assert.strictEqual(lib.acceptListing({ source: 'measured', scope: 'trunk', refs: 1, bytes: 40, illustration: true }), false);
ok('only a measured trunk listing counts');

const banned = ['Pando', 'pando', 'OpenAI', 'petabyte', 'packfile', 'child_process', 'execSync', 'execFile', 'SIGKILL', 'SIGTERM', '2400'];
for (const file of ['tools/lib/one-branch.js', 'tools/one-branch.js']) {
  const source = fs.readFileSync(path.join(ROOT, file), 'utf8');
  for (const word of banned) assert.ok(!source.includes(word), `${file} contains ${word}`);
}
assert.ok(!Object.keys(lib).some((name) => /send|push|fetch|pack|mirror|download/i.test(name)));
ok('the check does not push or name a backend');

const one = runCli(['check', '--default', 'simple', '--', 'git', 'push', '-u', 'origin', 'HEAD']);
assert.strictEqual(one.status, 0);
assert.match(one.stdout, /^Allowed\. The push moves one branch/);

const named = runCli(['check', '--default', 'simple', '--', 'git', 'push', 'origin', MARKER]);
assert.strictEqual(named.status, 0);
assert.ok(!named.stdout.includes(MARKER));

const matching = runCli(['check', '--default', 'matching', '--', 'git', 'push']);
assert.strictEqual(matching.status, 77);
assert.match(matching.stdout, /^Blocked\. A matching push moves every shared branch/);

const every = runCli(['check', '--default', 'simple', '--', 'git', 'push', '--all']);
assert.strictEqual(every.status, 77);
assert.match(every.stdout, /^Blocked\. That push moves every ref/);

const many = runCli(['check', '--default', 'simple', '--', 'git', 'push', 'origin', 'a', MARKER]);
assert.strictEqual(many.status, 77);
assert.match(many.stdout, /^Blocked\. That push names more than one ref/);
assert.ok(!many.stdout.includes(MARKER));

const wild = runCli(['check', '--default', 'simple', '--', 'git', 'push', 'origin', `refs/heads/*:${MARKER}`]);
assert.strictEqual(wild.status, 77);
assert.match(wild.stdout, /^Blocked\. A wildcard push moves every matching ref/);
assert.ok(!wild.stdout.includes(MARKER));

const unknown = runCli(['check', '--default', MARKER, '--', 'git', 'push']);
assert.strictEqual(unknown.status, 77);
assert.match(unknown.stdout, /^Blocked\. The push default is not one branch/);
assert.ok(!unknown.stdout.includes(MARKER));

const trunk = runCli(['advertise', '--refs', '1', '--bytes', '40', '--source', 'measured', '--scope', 'trunk']);
assert.strictEqual(trunk.status, 0);
assert.match(trunk.stdout, /^Allowed\. The listing names the trunk/);
assert.match(trunk.stdout, /refs=1 bytes=40/);

const wide = runCli(['advertise', '--refs', '3', '--bytes', '80', '--source', 'measured', '--scope', 'every-ref']);
assert.strictEqual(wide.status, 77);
assert.match(wide.stdout, /^Blocked\. The listing names every ref/);

const sped = runCli(['advertise', '--speedup', '4242']);
assert.strictEqual(sped.status, 77);
assert.match(sped.stdout, /^Refused\. That listing is not a local measurement/);
assert.ok(!sped.stdout.includes('4242'));

const grown = runCli(['advertise', '--percent', '2400']);
assert.strictEqual(grown.status, 77);
assert.ok(!grown.stdout.includes('2400'));

const usage = runCli(['check']);
assert.strictEqual(usage.status, 2);
ok('the command allows one branch and does not echo a foreign name');

console.log(`passed ${passed}`);
