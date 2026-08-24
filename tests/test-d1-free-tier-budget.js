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
