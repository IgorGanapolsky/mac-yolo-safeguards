#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { guardSourceValue, reviewSelfScoreSource } = require('../tools/source-value-guard');

const card = ['4111', '2222', '3333', '4444'].join('-');
const other = ['4000', '0000', '0000', '0002'].join('-');
const ssn = ['123', '45', '6789'].join('-');
const key = 'sk-' + 'ab'.repeat(16);

function ids(report) {
  return report.findings.map((item) => item.id);
}

const clean = guardSourceValue({
  text: 'The listing is ready.',
  measuredCents: 100,
  measuredSource: 'processor',
  spend: true,
  callCap: 10,
  agents: [{ id: 'panel', tracked: true }],
  vendorFigures: [{ asLocal: false }],
});
assert.strictEqual(clean.ok, true);
assert.deepStrictEqual(clean.findings, []);

const typed = guardSourceValue({ text: 'Ship it.', valueScore: 8, riskScore: 3 });
assert.strictEqual(typed.ok, false);
assert.ok(ids(typed).indexOf('selfScore') !== -1);

const skipped = guardSourceValue({
  text: 'Ship it.',
  skipGovernance: true,
  measuredCents: 100,
  measuredSource: 'processor',
});
assert.strictEqual(skipped.ok, false);
assert.ok(ids(skipped).indexOf('skipped') !== -1);

const vendor = guardSourceValue({ text: 'Ship it.', vendorFigures: [{ asLocal: true }] });
assert.ok(ids(vendor).indexOf('vendorFigure') !== -1);

const uncapped = guardSourceValue({ text: 'Ship it.', spend: true });
assert.ok(ids(uncapped).indexOf('noCap') !== -1);

const shadow = guardSourceValue({ text: 'Ship it.', agents: [{ id: 'draft', tracked: false }] });
assert.ok(ids(shadow).indexOf('untracked') !== -1);

const raw = guardSourceValue({ text: 'Pay ' + card + ' id ' + ssn + ' key ' + key });
assert.strictEqual(raw.ok, false);
assert.deepStrictEqual(ids(raw).filter((id) => id === 'rawCard' || id === 'rawSsn' || id === 'rawKey').sort(), ['rawCard', 'rawKey', 'rawSsn']);
assert.ok(raw.outbound.indexOf(card) === -1);
assert.ok(raw.outbound.indexOf(ssn) === -1);
assert.ok(raw.outbound.indexOf(key) === -1);
assert.ok(raw.outbound.indexOf('sk-') === -1);

const again = guardSourceValue({ text: raw.outbound });
assert.ok(ids(again).indexOf('rawCard') === -1);
assert.ok(ids(again).indexOf('rawSsn') === -1);
assert.ok(ids(again).indexOf('rawKey') === -1);
assert.ok(raw.outbound.indexOf(guardSourceValue({ text: card }).outbound) !== -1);

const first = guardSourceValue({ text: card }).outbound;
const second = guardSourceValue({ text: card }).outbound;
const different = guardSourceValue({ text: other }).outbound;
assert.strictEqual(first, second);
assert.notStrictEqual(first, different);

const badSource = [
  'const estimatedValue = task.businessValueScore || 1.0;',
  'const ratio = estimatedValue / estimatedRisk;',
  'allowed: ratio >= 1.0',
].join('\n');
assert.ok(reviewSelfScoreSource(badSource).some((item) => item.id === 'selfScore'));
assert.ok(reviewSelfScoreSource('Databolt protects the column').some((item) => item.id === 'vendorName'));
assert.deepStrictEqual(reviewSelfScoreSource('a local check'), []);

function runCli(filePath) {
  return spawnSync(process.execPath, [
    path.join(__dirname, '..', 'tools', 'source-value-guard.js'),
    filePath,
  ], { encoding: 'utf8' });
}

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'source-value-guard-'));
const failingPath = path.join(dir, 'typed.json');
fs.writeFileSync(failingPath, JSON.stringify({ text: 'Ship it.', valueScore: 8, riskScore: 3 }));
const before = fs.readFileSync(failingPath);
const failing = runCli(failingPath);
assert.strictEqual(failing.status, 1);
assert.ok(failing.stdout.indexOf('selfScore') !== -1);
assert.ok(failing.stdout.indexOf(card) === -1);
assert.ok(before.equals(fs.readFileSync(failingPath)));

const passingPath = path.join(dir, 'clean.json');
fs.writeFileSync(passingPath, JSON.stringify({ text: 'The listing is ready.' }));
const passing = runCli(passingPath);
assert.strictEqual(passing.status, 0);

const missing = runCli(path.join(dir, 'missing.json'));
assert.strictEqual(missing.status, 2);

console.log('source-value-guard: PASS');
