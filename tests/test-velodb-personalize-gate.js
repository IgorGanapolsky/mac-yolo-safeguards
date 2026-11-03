#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const lib = require(path.join(ROOT, 'tools', 'lib', 'velodb-personalize-gate'));
const cli = path.join(ROOT, 'tools', 'velodb-personalize-gate.js');

function runCli(args) {
  return spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8' });
}

let passed = 0;
function ok(name) {
  passed += 1;
  console.log(`ok ${passed} ${name}`);
}

assert.strictEqual(lib.PAGE_READ.heading, 'Let’s personalize your experience');
assert.strictEqual(lib.PAGE_READ.signedIn, true);
assert.strictEqual(lib.PAGE_READ.continued, false);
assert.strictEqual(lib.PAGE_READ.dropdownsLabeled, false);
assert.strictEqual(lib.PAGE_READ.workloads.length, 4);
assert.deepStrictEqual(lib.PAGE_READ.workloads.map((row) => row.name), [
  'Real-time Analytics',
  'Observability',
  'RAG and GenAI',
  'Lakehouse',
]);
assert.strictEqual(lib.PAGE_READ.newsletter.trialStarted, false);
assert.strictEqual(lib.PAGE_READ.newsletter.measuredLocally, false);
assert.match(lib.PAGE_READ.newsletter.line, /without adding more systems/);
ok('the signed-in menu has four labels and the trial was not started');

for (const row of lib.PAGE_READ.workloads) {
  const plan = lib.judgePersonalize({ workload: row.name });
  assert.strictEqual(plan.effect, 'label');
  assert.strictEqual(plan.workload, row.id);
  assert.strictEqual(plan.provisioned, false);
  assert.strictEqual(plan.addedDatabase, false);
  assert.strictEqual(plan.calledVelo, false);
  assert.strictEqual(plan.trialStarted, false);
}
assert.strictEqual(lib.judgePersonalize({ workload: 'lakehouse' }).workload, 'lakehouse');
ok('each menu choice stays a label');

for (const flag of ['trial', 'signup', 'continueSetup', 'contactSales', 'addDatabase']) {
  const plan = lib.judgePersonalize({ [flag]: true, workload: 'Lakehouse' });
  assert.strictEqual(plan.effect, 'refuse');
  assert.strictEqual(plan.provisioned, false);
  assert.strictEqual(plan.addedDatabase, false);
  assert.strictEqual(plan.trialStarted, false);
}
const remote = lib.judgePersonalize({ callVelo: true, remote: 'https://www.velodb.cloud/personalize' });
assert.strictEqual(remote.effect, 'refuse');
assert.strictEqual(remote.calledVelo, false);
assert.strictEqual(lib.judgePersonalize({ workload: 'Vector warehouse' }).effect, 'refuse');
assert.strictEqual(lib.judgePersonalize({ claim: true, workload: 'Observability' }).effect, 'refuse');
ok('a trial, a call, and an unknown workload are refused');

for (const file of ['tools/lib/velodb-personalize-gate.js', 'tools/velodb-personalize-gate.js']) {
  const source = fs.readFileSync(path.join(ROOT, file), 'utf8');
  assert.ok(!source.includes('fetch('));
  assert.ok(!source.includes('https.request'));
  assert.ok(!source.includes('child_process'));
  for (const word of ['MiniMax', 'Xiaomi', '384', '50000', '94%']) {
    assert.ok(!source.includes(word), `${file} contains ${word}`);
  }
}
ok('the check does not call out or store a vendor figure');

const labeled = runCli(['label', '--workload', 'Real-time Analytics']);
assert.strictEqual(labeled.status, 0);
assert.match(labeled.stdout, /^Admitted\. The personalize choice is a label/);
assert.match(labeled.stdout, /provisioned=false calledVelo=false addedDatabase=false trialStarted=false/);

const trial = runCli(['trial']);
assert.strictEqual(trial.status, 77);
assert.match(trial.stdout, /^Refused\. The menu stays a label/);

const continued = runCli(['continue']);
assert.strictEqual(continued.status, 77);

const warehouse = runCli(['warehouse']);
assert.strictEqual(warehouse.status, 77);
assert.match(warehouse.stdout, /addedDatabase=false/);

const claimed = runCli(['claim', '--relevance', '94']);
assert.strictEqual(claimed.status, 77);
assert.match(claimed.stdout, /^Refused\. That figure was not measured here/);
assert.ok(!claimed.stdout.includes('94'));
ok('the command keeps the label and prints no invented figure');

console.log(`test-velodb-personalize-gate: PASS ${passed}`);
