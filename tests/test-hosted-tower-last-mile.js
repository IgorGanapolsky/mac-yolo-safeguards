#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  SOURCE,
  honesty,
  classifyFoundation,
  stableJobUrl,
  gradeLastMile,
  attachLastMile,
  main,
} = require('../tools/hosted-tower-last-mile');

const h = honesty();
assert.strictEqual(h.clonedTower, false);
assert.strictEqual(h.clonedMotherDuck, false);
assert.strictEqual(h.clonedDuckDb, false);
assert.strictEqual(h.clonedFlights, false);
assert.strictEqual(h.clonedPythonPipelineSku, false);
assert.strictEqual(h.dualEditOnaLastMile, false);
assert.strictEqual(h.dualEditExecutionReceipt, false);
assert.strictEqual(h.workerLive, false);
assert.strictEqual(h.capturedRevenueUsd, 0);
assert.strictEqual(h.source, SOURCE);

assert.strictEqual(classifyFoundation('vps'), 'owned');
assert.strictEqual(classifyFoundation('tower'), 'rented');
assert.strictEqual(classifyFoundation('MacBook'), 'rented');
assert.strictEqual(stableJobUrl('task-1'), 'https://thumbgate.app/dashboard?task=task-1');
assert.strictEqual(stableJobUrl('bad/id'), null);

const rented = gradeLastMile({
  executor: 'tower',
  generatedByAgent: true,
  sandbox: true,
  schedule: 'once',
  credentialsBound: true,
  taskId: 't-rent',
});
assert.strictEqual(rented.foundation, 'rented');
assert.strictEqual(rented.lastMileComplete, false);
assert.strictEqual(rented.liveClaim, false);
assert.ok(rented.reasons.includes('cannot_rent_foundation'));

const incomplete = gradeLastMile({
  executor: 'vps',
  generatedByAgent: true,
  sandbox: false,
  schedule: 'none',
  credentialsBound: false,
});
assert.strictEqual(incomplete.status, 'LAST_MILE_INCOMPLETE');
assert.ok(incomplete.reasons.includes('agent_wrote_code_missing_sandbox'));
assert.ok(incomplete.reasons.includes('agent_wrote_code_missing_schedule'));
assert.ok(incomplete.reasons.includes('agent_wrote_code_missing_credentials'));

const hosted = gradeLastMile({
  executor: 'vps',
  generatedByAgent: true,
  sandbox: true,
  schedule: 'once',
  credentialsBound: true,
  taskId: 't-ok',
  workerLive: true,
});
assert.strictEqual(hosted.lastMileComplete, true);
assert.strictEqual(hosted.liveClaim, false);
assert.strictEqual(hosted.status, 'NOT_LIVE');
assert.strictEqual(hosted.stableUrl, 'https://thumbgate.app/dashboard?task=t-ok');
assert.strictEqual(hosted.clonedTower, false);

const talk = gradeLastMile({
  blogUrl: SOURCE,
  executor: 'vps',
  sandbox: true,
  schedule: 'once',
  credentialsBound: true,
  taskId: 't-talk',
});
assert.ok(talk.reasons.includes('talk_is_not_production'));
assert.strictEqual(talk.lastMileComplete, false);

const sku = gradeLastMile({
  claimedProduct: 'Tower Control python pipeline runtime',
  executor: 'vps',
  sandbox: true,
  schedule: 'once',
  credentialsBound: true,
  taskId: 't-sku',
});
assert.strictEqual(sku.status, 'NOT_OFFERED');

const attach = attachLastMile({
  runtime: 'vps',
  sandbox: true,
  schedule: 'once',
  credentialsBound: true,
  generatedByAgent: true,
  taskId: 'abc',
});
assert.strictEqual(attach.liveClaim, false);
assert.strictEqual(attach.clonedTower, false);
assert.match(attach.stableUrl, /dashboard\?task=abc$/);

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'tower-last-mile-'));
const gradeFile = path.join(tmp, 'grade.json');
fs.writeFileSync(gradeFile, JSON.stringify({
  executor: 'vps',
  generatedByAgent: true,
  sandbox: true,
  schedule: 'once',
  credentialsBound: true,
  taskId: 'cli-1',
}));
assert.strictEqual(main(['--grade', gradeFile, '--json']), 0);
assert.strictEqual(main(['--demo', '--json']), 0);
assert.strictEqual(main(['--json']), 0);

const src = fs.readFileSync(path.join(__dirname, '../tools/hosted-tower-last-mile.js'), 'utf8');
assert.doesNotMatch(src, /from tower import|control\.tower\.dev\/api/);
assert.doesNotMatch(src, /CREATE TABLE duckdb/i);

console.log('test-hosted-tower-last-mile: PASS');
