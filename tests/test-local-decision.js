#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const lib = require(path.join(ROOT, 'tools', 'lib', 'local-decision'));
const cli = path.join(ROOT, 'tools', 'local-decision.js');
const MARKER = 'do-not-echo-this-phrase';

function runCli(args) {
  return spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8' });
}

let passed = 0;
function ok(name) {
  passed += 1;
  console.log(`ok ${passed} ${name}`);
}

const picked = lib.judgeQuestion(
  { type: 'choice', criteria: { allow: 'do it', ask: 'wait', block: 'stop' } },
  'ask',
);
assert.strictEqual(picked.effect, 'answer');
assert.strictEqual(picked.choice, 'ask');
assert.deepStrictEqual(picked.probabilities, { allow: 0, ask: 1, block: 0 });
assert.strictEqual(Object.values(picked.probabilities).reduce((sum, value) => sum + value, 0), 1);
ok('one named gate gets probability 1 and the others get 0');

assert.strictEqual(lib.judgeQuestion({ type: 'choice', criteria: ['yes', 'no'] }, 'allow').effect, 'abstain');
assert.strictEqual(lib.judgeQuestion({ type: 'choice', criteria: ['allow', 'allow'] }, 'allow').effect, 'abstain');
assert.strictEqual(lib.judgeQuestion({ type: 'choice', criteria: ['allow', 'block'] }, 'ask').effect, 'abstain');
assert.strictEqual(lib.judgeQuestion({ type: 'choice', criteria: ['allow', 'ask', 'block'] }, 'yes').effect, 'abstain');
assert.strictEqual(lib.judgeQuestion({ type: 'score' }, 'allow').effect, 'abstain');
assert.strictEqual(lib.judgeQuestion({ type: 'noul', instructions: 'how good is this' }, 'allow').effect, 'abstain');
assert.strictEqual(lib.judgeQuestion({ type: 'noul', id: 'proceed' }, 'block').noul, 0);
assert.strictEqual(lib.judgeQuestion({ type: 'noul', id: 'proceed' }, 'allow').noul, 1);
ok('a foreign option list and every score abstain');

assert.strictEqual(lib.acceptScore({ probability: 1, source: 'rule' }), true);
assert.strictEqual(lib.acceptScore({ probability: 0, source: 'rule' }), true);
assert.strictEqual(lib.acceptScore({ probability: 0.7, source: 'rule' }), false);
assert.strictEqual(lib.acceptScore({ probability: 1, source: 'rule', rank: 4 }), false);
assert.strictEqual(lib.acceptScore({ probability: 1, source: 'rule', price: 9 }), false);
assert.strictEqual(lib.acceptScore({ probability: 1, source: 'model', illustration: true }), false);
ok('only a 0 or a 1 from the local rule counts');

const banned = ['Nace', 'Drex', 'Kapitsa', 'OpenRouter', 'huggingface', 'child_process', 'SIGKILL', 'SIGTERM', 'execFile', '27B', 'fourth'];
for (const file of ['tools/lib/local-decision.js', 'tools/local-decision.js']) {
  const source = fs.readFileSync(path.join(ROOT, file), 'utf8');
  for (const word of banned) assert.ok(!source.includes(word), `${file} contains ${word}`);
}
assert.ok(!Object.keys(lib).some((name) => /send|download|fetch|infer|weight/i.test(name)));
ok('the check does not name a model or download one');

const asked = runCli(['choice', '--gate', 'ask', '--options', 'allow,ask,block']);
assert.strictEqual(asked.status, 0);
assert.match(asked.stdout, /^Answered ask\. The local gate picked one option/);
assert.match(asked.stdout, /allow=0 ask=1 block=0/);

const foreign = runCli(['choice', '--gate', 'allow', '--options', `allow,${MARKER}`]);
assert.strictEqual(foreign.status, 75);
assert.match(foreign.stdout, /^Abstained\. The options are not the local gate/);
assert.ok(!foreign.stdout.includes(MARKER));

const held = runCli(['proceed', '--gate', 'ask']);
assert.strictEqual(held.status, 0);
assert.match(held.stdout, /^Answered 0\. Proceed only when the gate allows/);

const go = runCli(['proceed', '--gate', 'allow']);
assert.strictEqual(go.status, 0);
assert.match(go.stdout, /^Answered 1\. Proceed only when the gate allows/);

const score = runCli(['score']);
assert.strictEqual(score.status, 75);
assert.match(score.stdout, /^Abstained\. No local score/);

const rule = runCli(['measure', '--probability', '1', '--source', 'rule']);
assert.strictEqual(rule.status, 0);
assert.match(rule.stdout, /^Answered 1\. The probability is the local rule/);

const ranked = runCli(['measure', '--probability', '1', '--source', 'rule', '--rank', '4242']);
assert.strictEqual(ranked.status, 77);
assert.match(ranked.stdout, /^Refused\. That score is not the local rule/);
assert.ok(!ranked.stdout.includes('4242'));

const priced = runCli(['measure', '--probability', '1', '--source', 'rule', '--price', '5150']);
assert.strictEqual(priced.status, 77);
assert.ok(!priced.stdout.includes('5150'));

const usage = runCli(['choice']);
assert.strictEqual(usage.status, 2);
ok('the command answers the gate and does not echo a foreign score');

console.log(`passed ${passed}`);
