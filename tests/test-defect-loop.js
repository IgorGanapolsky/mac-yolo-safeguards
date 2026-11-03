#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const lib = require(path.join(ROOT, 'tools', 'lib', 'defect-loop'));
const cli = path.join(ROOT, 'tools', 'defect-loop.js');
const MARKER = 'do-not-echo-this-phrase';

function runCli(args) {
  return spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8' });
}

let passed = 0;
function ok(name) {
  passed += 1;
  console.log(`ok ${passed} ${name}`);
}

assert.strictEqual(lib.judgeReport('the build failed', 0).effect, 'reproduce');
assert.strictEqual(lib.judgeReport('@someone the build failed', 0).effect, 'reproduce');
assert.strictEqual(lib.signature('@someone the build failed'), lib.signature('the build failed'));
assert.strictEqual(lib.judgeReport('@someone hello', 0).effect, 'ignore');
assert.strictEqual(lib.judgeReport('', 0).effect, 'ignore');
ok('a defect still counts when nobody is mentioned');

assert.strictEqual(lib.judgeReport('the build failed', 1).effect, 'stop');
assert.match(lib.judgeReport('the build failed', 1).reason, /already had a try/);
assert.strictEqual(lib.judgeReport('the build failed', 1, 'exit 75', '').effect, 'reproduce');
assert.strictEqual(lib.judgeReport('the build failed', 1, 'exit 75', 'exit 75').effect, 'stop');
assert.strictEqual(lib.judgeReport('the build failed', 1.5).effect, 'stop');
ok('the same report stops, and a new fact reopens one try');

assert.strictEqual(lib.judgeResult({ reproduced: true }).effect, 'hold');
assert.strictEqual(lib.judgeResult({ reproduced: true, accepted: true }).effect, 'accept');
assert.strictEqual(lib.judgeResult({ fixed: true }).effect, 'refuse');
assert.strictEqual(lib.judgeResult({ accepted: true }).effect, 'refuse');
assert.match(lib.judgeResult({ fixed: true }).reason, /needs a reproduction/);
ok('a person accepts a result only after it was reproduced');

assert.strictEqual(lib.acceptMeasurement({ minutes: 12.4, source: 'article', illustration: true }), false);
assert.strictEqual(lib.acceptMeasurement({ minutes: 40, source: 'measured', percent: 27 }), false);
assert.strictEqual(lib.acceptMeasurement({ minutes: 40, source: 'measured', price: 4900 }), false);
assert.strictEqual(lib.acceptMeasurement({ minutes: 40, source: 'measured' }), true);
ok('a percent or a price is not a measurement');

const banned = ['DeepSeek', 'Yicai', 'Super-agent', 'child_process', 'SIGKILL', 'SIGTERM', 'execFile', '12.4', '6.4', '27%'];
for (const file of ['tools/lib/defect-loop.js', 'tools/defect-loop.js']) {
  const source = fs.readFileSync(path.join(ROOT, file), 'utf8');
  for (const word of banned) {
    assert.ok(!source.includes(word), `${file} contains ${word}`);
  }
}
assert.ok(!Object.keys(lib).some((name) => /send|buy|heal|watch|kill|spill/i.test(name)));
ok('the check has no vendor name and no process scan');

const first = runCli(['report', '--text', `the mac froze ${MARKER}`, '--seen', '0']);
assert.strictEqual(first.status, 0);
assert.match(first.stdout, /^Reproduced\. Reproduce it before anyone accepts a fix\./);
assert.ok(!first.stdout.includes(MARKER));

const repeat = runCli(['report', '--text', 'the mac froze', '--seen', '1']);
assert.strictEqual(repeat.status, 77);
assert.match(repeat.stdout, /^Stopped\. The same report already had a try/);

const mention = runCli(['report', '--text', '@someone hello']);
assert.strictEqual(mention.status, 0);
assert.match(mention.stdout, /^Ignored\. No defect is stated/);

const held = runCli(['result', '--reproduced']);
assert.strictEqual(held.status, 75);
assert.match(held.stdout, /^Held\. Reproduced\. Waiting for a person/);

const accepted = runCli(['result', '--reproduced', '--accepted']);
assert.strictEqual(accepted.status, 0);
assert.match(accepted.stdout, /^Accepted\. A person accepted a reproduced result/);

const claimed = runCli(['result', '--fixed']);
assert.strictEqual(claimed.status, 77);
assert.match(claimed.stdout, /needs a reproduction/);

const priced = runCli(['measure', '--minutes', '40', '--source', 'measured', '--percent', '27']);
assert.strictEqual(priced.status, 77);
assert.ok(!priced.stdout.includes('27'));

const measured = runCli(['measure', '--minutes', '40', '--source', 'measured']);
assert.strictEqual(measured.status, 0);

const usage = runCli([]);
assert.strictEqual(usage.status, 2);
ok('the command reproduces once, stops a repeat, and refuses a bare fix claim');

console.log(`passed ${passed}`);
