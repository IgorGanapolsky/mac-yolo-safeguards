'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawnSync } = require('child_process');
const { exportDpoPairs } = require('../tools/export-dpo-benchmark-pairs');

function makeTemp(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dpo-export-test-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

function observedPair(id) {
  return {
    id,
    prompt: `prompt-${id}`,
    chosen: `chosen-${id}`,
    rejected: `rejected-${id}`,
    source: 'human-thumb-feedback',
    timestamp: '2026-08-24T12:00:00.000Z',
  };
}

test('withholds output when no observed preference pairs exist', (t) => {
  const root = makeTemp(t);
  const inputPath = path.join(root, 'empty.json');
  const outputPath = path.join(root, 'dpo.jsonl');
  fs.writeFileSync(inputPath, '[]\n');

  const result = exportDpoPairs({ inputPath, outputPath, minPairs: 1 });

  assert.equal(result.ok, false);
  assert.equal(result.status, 'insufficient_pairs');
  assert.equal(result.totalEligible, 0);
  assert.equal(result.outputCreated, false);
  assert.equal(fs.existsSync(outputPath), false);
});

test('rejects malformed input without creating an output file', (t) => {
  const root = makeTemp(t);
  const inputPath = path.join(root, 'malformed.json');
  const outputPath = path.join(root, 'dpo.jsonl');
  fs.writeFileSync(inputPath, '{not-json');

  const result = exportDpoPairs({ inputPath, outputPath, minPairs: 1 });

  assert.equal(result.ok, false);
  assert.equal(result.status, 'invalid_input');
  assert.equal(result.outputCreated, false);
  assert.equal(fs.existsSync(outputPath), false);
});

test('exports only deduplicated, provenance-bearing observed pairs', (t) => {
  const root = makeTemp(t);
  const inputPath = path.join(root, 'pairs.json');
  const outputPath = path.join(root, 'nested', 'dpo.jsonl');
  const first = observedPair('one');
  fs.writeFileSync(inputPath, JSON.stringify([
    first,
    first,
    observedPair('two'),
    { prompt: 'missing provenance', chosen: 'yes', rejected: 'no' },
  ]));

  const result = exportDpoPairs({ inputPath, outputPath, minPairs: 2 });

  assert.equal(result.ok, true);
  assert.equal(result.status, 'ready');
  assert.equal(result.totalExported, 2);
  assert.equal(result.duplicateRecords, 1);
  assert.equal(result.rejectedRecords, 1);
  assert.equal(fs.existsSync(outputPath), true);

  const pairs = fs.readFileSync(outputPath, 'utf8').trim().split('\n').map(JSON.parse);
  assert.equal(pairs.length, 2);
  assert.equal(pairs[0].source, 'human-thumb-feedback');
  assert.match(pairs[0].provenance.recordId, /one/);
  assert.match(pairs[0].provenance.sha256, /^[a-f0-9]{64}$/);
});

test('--help is side-effect free', (t) => {
  const root = makeTemp(t);
  const home = path.join(root, 'home');
  const cwd = path.join(root, 'cwd');
  fs.mkdirSync(home);
  fs.mkdirSync(cwd);

  const result = spawnSync(process.execPath, [path.join(__dirname, '..', 'tools', 'export-dpo-benchmark-pairs.js'), '--help'], {
    cwd,
    env: { ...process.env, HOME: home },
    encoding: 'utf8',
  });

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /--min-pairs/);
  assert.equal(fs.existsSync(path.join(cwd, '.thumbgate')), false);
  assert.equal(fs.existsSync(path.join(home, '.thumbgate')), false);
});
