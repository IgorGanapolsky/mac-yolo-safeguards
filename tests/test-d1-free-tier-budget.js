'use strict';

const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const {
  FREE_READS,
  FREE_WRITES,
  evaluateD1FreeTier,
  parseInfo,
} = require('../tools/d1-free-tier-budget.js');

test('evaluates wrangler d1 info JSON against 5M/100k free caps', () => {
  const today = evaluateD1FreeTier({ rows_read_24h: 807610, rows_written_24h: 12051 });
  assert.equal(today.status, 'ok');
  assert.equal(FREE_READS, 5_000_000);
  assert.equal(FREE_WRITES, 100_000);

  assert.equal(evaluateD1FreeTier({ rows_read_24h: 4_000_000, rows_written_24h: 0 }).status, 'warn');
  assert.equal(evaluateD1FreeTier({ rows_read_24h: 5_000_000, rows_written_24h: 0 }).status, 'exceeded');
  assert.equal(evaluateD1FreeTier({ rows_read_24h: 0, rows_written_24h: 100_000 }).status, 'exceeded');
});

test('CLI exits 0 on under-budget info JSON and 2 when exceeded', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'd1-budget-'));
  const okFile = path.join(dir, 'ok.json');
  const badFile = path.join(dir, 'bad.json');
  fs.writeFileSync(okFile, JSON.stringify({
    uuid: '659d4b21-21c4-4b39-b63b-b5bf4234de13',
    name: 'hermes-control-plane',
    rows_read_24h: 807610,
    rows_written_24h: 12051,
  }));
  fs.writeFileSync(badFile, JSON.stringify({
    name: 'hermes-control-plane',
    rows_read_24h: 865801023,
    rows_written_24h: 12051,
  }));
  const bin = path.join(__dirname, '..', 'tools', 'd1-free-tier-budget.js');
  const ok = spawnSync(process.execPath, [bin, '--json', okFile], { encoding: 'utf8' });
  assert.equal(ok.status, 0, ok.stderr);
  const okJson = JSON.parse(ok.stdout);
  assert.equal(okJson.status, 'ok');
  assert.equal(okJson.name, 'hermes-control-plane');
  const bad = spawnSync(process.execPath, [bin, '--json', badFile], { encoding: 'utf8' });
  assert.equal(bad.status, 2, bad.stderr);
  assert.equal(JSON.parse(bad.stdout).status, 'exceeded');
  fs.rmSync(dir, { recursive: true, force: true });
});

test('parseInfo rejects non-objects', () => {
  assert.throws(() => parseInfo('[]'), /expected wrangler d1 info JSON object/);
});

test('missing or non-numeric counters fail closed instead of certifying "ok"', () => {
  // Number(x) || 0 previously turned an absent counter into a measured zero,
  // so {"name":"hermes-control-plane"} reported status "ok" and exit 0 having
  // measured nothing at all.
  const bare = evaluateD1FreeTier({ name: 'hermes-control-plane' });
  assert.equal(bare.status, 'unknown');
  assert.deepEqual(bare.problems, ['missing rows_read_24h', 'missing rows_written_24h']);
  assert.equal(bare.read_ratio, null);
  assert.equal(bare.write_ratio, null);

  for (const bad of [
    { rows_read_24h: null, rows_written_24h: 10 },
    { rows_read_24h: 'abc', rows_written_24h: 10 },
    { rows_read_24h: NaN, rows_written_24h: 10 },
    { rows_read_24h: Infinity, rows_written_24h: 10 },
    { rows_read_24h: -1, rows_written_24h: 10 },
    { rows_read_24h: 10 },
    {},
  ]) {
    assert.equal(evaluateD1FreeTier(bad).status, 'unknown', JSON.stringify(bad));
  }

  // A genuine zero is still a measurement, not a missing value.
  assert.equal(evaluateD1FreeTier({ rows_read_24h: 0, rows_written_24h: 0 }).status, 'ok');
  // Numeric strings from a JSON export remain acceptable.
  assert.equal(evaluateD1FreeTier({ rows_read_24h: '807610', rows_written_24h: '12051' }).status, 'ok');
});

test('CLI exits 2 on an unmeasurable info JSON', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'd1-budget-unknown-'));
  const file = path.join(dir, 'partial.json');
  fs.writeFileSync(file, JSON.stringify({ name: 'hermes-control-plane' }));
  const bin = path.join(__dirname, '..', 'tools', 'd1-free-tier-budget.js');

  const asJson = spawnSync(process.execPath, [bin, '--json', file], { encoding: 'utf8' });
  assert.equal(asJson.status, 2, asJson.stderr);
  assert.equal(JSON.parse(asJson.stdout).status, 'unknown');

  const asText = spawnSync(process.execPath, [bin, file], { encoding: 'utf8' });
  assert.equal(asText.status, 2, asText.stderr);
  assert.match(asText.stdout, /refusing to certify under budget/);

  fs.rmSync(dir, { recursive: true, force: true });
});
