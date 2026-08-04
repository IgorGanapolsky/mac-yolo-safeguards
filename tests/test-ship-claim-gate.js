#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const {
  evaluateShipClaim,
  summarizeResults,
  parseMatrixFile,
  matrixSummary,
} = require('../tools/ship-claim-gate');

function test(name, fn) {
  try {
    fn();
    console.log(`PASS ${name}`);
  } catch (e) {
    console.error(`FAIL ${name}`);
    console.error(e.stack || e.message);
    process.exitCode = 1;
  }
}

const ROOT = path.resolve(__dirname, '..');
const CLI = path.join(ROOT, 'tools/ship-claim-gate.js');

test('summarizeResults counts ok/fail', () => {
  const s = summarizeResults([
    { id: 'a', ok: true, comment_id: 't1_x' },
    { id: 'b', ok: false, error: 'reddit broke' },
    { id: 'c', ok: false, error: '500' },
  ]);
  assert.strictEqual(s.okCount, 1);
  assert.strictEqual(s.failCount, 2);
  assert.strictEqual(s.total, 3);
  assert.deepStrictEqual(s.okIds, ['t1_x']);
});

test('evaluate blocks all-LIVE overclaim', () => {
  const r = evaluateShipClaim({
    claim: 'All 4 community replies are LIVE',
    resultsSummary: summarizeResults([
      { ok: true, comment_id: 't1_1' },
      { ok: false, error: 'x' },
      { ok: false, error: 'y' },
      { ok: false, error: 'z' },
    ]),
  });
  assert.strictEqual(r.ok, false);
  assert.ok(r.blocks.some((b) => /okCount=1/i.test(b) || /Partial/i.test(b) || /Claimed/i.test(b)));
});

test('evaluate allows honest partial', () => {
  const r = evaluateShipClaim({
    claim: '1 LIVE t1_p1ccuu5; 3 FAIL rate-limit',
    resultsSummary: summarizeResults([
      { ok: true, comment_id: 't1_p1ccuu5' },
      { ok: false },
      { ok: false },
      { ok: false },
    ]),
  });
  assert.strictEqual(r.ok, true, JSON.stringify(r));
});

test('evaluate blocks bare shipped', () => {
  const r = evaluateShipClaim({ claim: 'Shipped and LIVE everywhere' });
  assert.strictEqual(r.ok, false);
});

test('evaluate device gate', () => {
  const bad = evaluateShipClaim({
    claim: 'works on device now',
    checkDevice: true,
    device: { e2e: 'fail', pass: false, path: '/tmp/x' },
  });
  assert.strictEqual(bad.ok, false);
  const good = evaluateShipClaim({
    claim: 'works on device now',
    checkDevice: true,
    device: { e2e: 'pass', pass: true, path: '/tmp/x', updatedAt: 't' },
  });
  assert.strictEqual(good.ok, true);
});

test('matrix LIVE requires proof', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ship-claim-'));
  const f = path.join(dir, 'm.md');
  fs.writeFileSync(
    f,
    `| post | status | proof |
| --- | --- | --- |
| 1uq5aqg | LIVE | t1_p1ccuu5 |
| 1vdszx7 | FAIL | rate-limit |
`,
  );
  const rows = parseMatrixFile(f);
  const sum = matrixSummary(rows);
  assert.strictEqual(sum.liveCount, 1);
  assert.strictEqual(sum.failCount, 1);
  const allClaim = evaluateShipClaim({
    claim: 'all posts LIVE',
    matrixSummary: sum,
  });
  assert.strictEqual(allClaim.ok, false);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('CLI --self-test exits 0', () => {
  const r = spawnSync(process.execPath, [CLI, '--self-test'], {
    encoding: 'utf8',
    cwd: ROOT,
  });
  assert.strictEqual(r.status, 0, r.stdout + r.stderr);
});

test('CLI blocks overclaim with results-json', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ship-claim-cli-'));
  const results = path.join(dir, 'results.json');
  fs.writeFileSync(
    results,
    JSON.stringify([
      { id: '1', ok: true, comment_id: 't1_a' },
      { id: '2', ok: false, error: 'broke' },
    ]),
  );
  const r = spawnSync(
    process.execPath,
    [CLI, '--claim', 'Both replies are LIVE', '--results-json', results, '--json'],
    { encoding: 'utf8', cwd: ROOT },
  );
  assert.strictEqual(r.status, 1, r.stdout + r.stderr);
  const j = JSON.parse(r.stdout);
  assert.strictEqual(j.ok, false);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('CLI allows sha ship claim', () => {
  const r = spawnSync(
    process.execPath,
    [
      CLI,
      '--claim',
      'Merged ship fix',
      '--require-sha',
      'abc123def456',
      '--json',
    ],
    { encoding: 'utf8', cwd: ROOT },
  );
  assert.strictEqual(r.status, 0, r.stdout + r.stderr);
  const j = JSON.parse(r.stdout);
  assert.strictEqual(j.ok, true);
});

if (!process.exitCode) {
  console.log('test-ship-claim-gate: all assertions ran');
}
