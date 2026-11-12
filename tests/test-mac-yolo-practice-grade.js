#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { gradePractice } = require('../tools/mac-yolo-practice-grade');

const TODAY = {
  measuredAt: '2026-11-12T15:21:00-0500',
  tasteGolden: { pass: 10, failed: 0, total: 10, updated: '2026-08-03' },
  tinker: {
    aPlus: false,
    grade: 'C',
    score: 9,
    evalPassed: 49,
    evalFailed: 0,
    evalTotal: 49,
  },
  dataScience: {
    ran: true,
    provesRevenue: false,
    prospects: 6,
    heuristicRows: 6,
    modelRows: 0,
    settledCents: null,
  },
  ml: {
    productionId: null,
    trained: false,
    holdoutAuc: null,
    modelCount: 0,
    paidPositives: 0,
  },
  graph: {
    graphBuilt: true,
    queryExit: 0,
    astNodes: 30,
    sqliteNodes: 1,
    queryNamesPanel: false,
    commitsBehindMain: 36,
    dirty: true,
    sqlInterpolated: true,
    probeChecked: false,
    ageHours: 26.9,
  },
};

const PROOF = {
  productGolden: {
    product: 'mac-yolo-safeguards',
    heldOut: true,
    failed: 0,
    total: 30,
    coversPanel: true,
    fixtureOnly: false,
  },
  dataScience: {
    ran: true,
    provesRevenue: true,
    settledCents: 4900,
    founderExcluded: true,
    source: 'processor',
    prospects: 0,
    heuristicRows: 0,
    modelRows: 0,
  },
  ml: {
    productionId: 'propensity-heldout',
    trained: true,
    holdoutAuc: 0.72,
    paidPositives: 30,
  },
  graph: {
    graphBuilt: true,
    queryExit: 0,
    astNodes: 12,
    queryNamesPanel: true,
    commitsBehindMain: 0,
    dirty: false,
    sqlInterpolated: false,
    probeChecked: true,
  },
};

function runCli(filePath) {
  return spawnSync(process.execPath, [
    path.join(__dirname, '..', 'tools', 'mac-yolo-practice-grade.js'),
    filePath,
  ], { encoding: 'utf8' });
}

const today = gradePractice(TODAY);
assert.strictEqual(today.ok, false);
assert.strictEqual(today.score, 2);
assert.strictEqual(today.letter, 'D');
assert.deepStrictEqual(today.planes.map((item) => item.score), [5, 3, 2, 5]);
assert.deepStrictEqual(today.planes.map((item) => item.letter), ['C', 'D+', 'D', 'C']);
assert.ok(today.planes.every((item) => item.score < 10));

const proof = gradePractice(PROOF);
assert.strictEqual(proof.ok, true);
assert.strictEqual(proof.score, 10);
assert.strictEqual(proof.letter, 'A+');

const noHoldout = gradePractice(Object.assign({}, PROOF, {
  ml: Object.assign({}, PROOF.ml, { holdoutAuc: null, trained: false, productionId: null }),
}));
assert.strictEqual(noHoldout.ok, false);
assert.ok(noHoldout.planes.find((item) => item.id === 'ml').score < 10);

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'practice-grade-'));
const failingPath = path.join(dir, 'today.json');
fs.writeFileSync(failingPath, JSON.stringify(TODAY));
const before = fs.readFileSync(failingPath);
const failing = runCli(failingPath);
assert.strictEqual(failing.status, 1);
assert.ok(failing.stdout.indexOf('practice grade: D (2/10)') !== -1);
assert.ok(before.equals(fs.readFileSync(failingPath)));

const passingPath = path.join(dir, 'proof.json');
fs.writeFileSync(passingPath, JSON.stringify(PROOF));
const passing = runCli(passingPath);
assert.strictEqual(passing.status, 0);
assert.ok(passing.stdout.indexOf('practice grade: A+ (10/10)') !== -1);

const missing = runCli(path.join(dir, 'missing.json'));
assert.strictEqual(missing.status, 2);

console.log('practice-grade: PASS');
