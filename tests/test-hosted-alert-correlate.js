#!/usr/bin/env node
'use strict';

const assert = require('assert');
const {
  honesty,
  correlate,
  suggestValidatedFix,
  shouldEmitDuplicate,
} = require('../tools/hosted-alert-correlate');

const h = honesty();
assert.strictEqual(h.clonedIgnio, false);
assert.strictEqual(h.clonedCloudWatch, false);
assert.strictEqual(h.dualEditRuleSprawl, false);
assert.strictEqual(h.autoApply, false);
assert.strictEqual(h.capturedRevenueUsd, 0);

const burst = Array.from({ length: 10 }, (_, i) => ({
  ts: 1000 + i * 10,
  method: 'POST',
  path: '/api/tasks',
  status: 500,
}));
const report = correlate(burst, { windowMs: 60_000, precursorCount: 3 });
assert.strictEqual(report.rawCount, 10);
assert.strictEqual(report.incidentCount, 1);
assert.ok(report.suppressRatio >= 0.9);
assert.strictEqual(report.incidents[0].family, 'hosted_admission');
assert.strictEqual(report.incidents[0].userFacing, true);
assert.strictEqual(report.incidents[0].suggestedFix.validated, false);
assert.strictEqual(report.incidents[0].suggestedFix.autoApply, false);

const related = correlate([
  { ts: 1, method: 'POST', path: '/api/tasks', status: 500 },
  { ts: 2, method: 'POST', path: '/api/nostr/events', status: 502 },
]);
assert.strictEqual(related.incidentCount, 1);

const healthy = correlate([{ ts: 1, method: 'GET', path: '/api/health', status: 200 }]);
assert.strictEqual(healthy.incidentCount, 0);
assert.strictEqual(healthy.rawCount, 0);

assert.strictEqual(suggestValidatedFix({ testsPass: true, receiptOk: false }).validated, false);
assert.strictEqual(suggestValidatedFix({ testsPass: true, receiptOk: true }).autoApply, false);

const last = {};
assert.strictEqual(
  shouldEmitDuplicate({ signature: 'x', now: 1, lastBySignature: last }).emit,
  true,
);
last.x = 1;
assert.strictEqual(
  shouldEmitDuplicate({ signature: 'x', now: 2, lastBySignature: last, windowMs: 1000 }).reason,
  'duplicate_suppressed',
);

const split = correlate(
  [
    { ts: 1000, method: 'POST', path: '/api/tasks', status: 500 },
    { ts: 3_601_000, method: 'POST', path: '/api/tasks', status: 500 },
  ],
  { windowMs: 60_000, precursorCount: 3 },
);
assert.strictEqual(split.incidentCount, 2);

const { main } = require('../tools/hosted-alert-correlate');
const fs = require('fs');
const path = require('path');
const origWrite = process.stdout.write.bind(process.stdout);
let buf = '';
process.stdout.write = (chunk) => {
  buf += String(chunk);
  return true;
};
const missingCode = main(['--json']);
process.stdout.write = origWrite;
const missing = JSON.parse(buf);
assert.strictEqual(missingCode, 1);
assert.strictEqual(missing.status, 'UNAVAILABLE');
assert.strictEqual(missing.liveClaim, false);

const tmp = path.join(require('os').tmpdir(), 'hosted-alert-events.json');
fs.writeFileSync(
  tmp,
  JSON.stringify([{ ts: 1, method: 'POST', path: '/api/tasks', status: 500 }]),
);
buf = '';
process.stdout.write = (chunk) => {
  buf += String(chunk);
  return true;
};
const fileCode = main(['--json', '--events', tmp]);
process.stdout.write = origWrite;
const fromFile = JSON.parse(buf);
assert.strictEqual(fileCode, 0);
assert.strictEqual(fromFile.status, 'SUCCESS');
assert.strictEqual(fromFile.liveClaim, true);
assert.strictEqual(fromFile.rawCount, 1);

process.stdout.write('ok tests/test-hosted-alert-correlate.js\n');
