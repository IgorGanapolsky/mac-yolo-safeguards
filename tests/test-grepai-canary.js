#!/usr/bin/env node
'use strict';

/**
 * Unit tests for tools/grepai-index-canary.js using synthetic .grepai dirs.
 * Deterministic — no grepai binary, no network — safe for CI runners.
 * Also runs the canary against the real .grepai in warn-only mode so the
 * current index health is VISIBLE in every CI log without failing the build
 * (repairing the index requires the Mac that owns Ollama + the checkout).
 */

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const REPO = path.resolve(__dirname, '..');
const CANARY = path.join(REPO, 'tools', 'grepai-index-canary.js');

function runCanary(args) {
  return spawnSync(process.execPath, [CANARY, ...args], { encoding: 'utf8' });
}

function makeDir(stats, indexBytes) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'grepai-canary-'));
  if (stats !== undefined) fs.writeFileSync(path.join(dir, 'stats.json'), JSON.stringify(stats));
  if (indexBytes !== undefined) fs.writeFileSync(path.join(dir, 'index.gob'), Buffer.alloc(indexBytes, 1));
  return dir;
}

const searches = (n, resultCount) => Array.from({ length: n }, (_, i) => ({ query: `q${i}`, result_count: resultCount }));

// 1. Healthy: recent searches return results, index is plausibly sized.
{
  const dir = makeDir({ searches: [...searches(10, 0), ...searches(10, 3)] }, 64 * 1024);
  const r = runCanary(['--dir', dir]);
  assert.strictEqual(r.status, 0, `healthy dir must exit 0, got ${r.status}: ${r.stdout}${r.stderr}`);
}

// 2. Dead index: all recent searches zero-result -> exit 1.
{
  const dir = makeDir({ searches: searches(20, 0) }, 64 * 1024);
  const r = runCanary(['--dir', dir]);
  assert.strictEqual(r.status, 1, `all-zero tail must exit 1, got ${r.status}`);
  assert.ok(r.stdout.includes('presumed dead'), 'must name the dead-index problem');
}

// 3. Empty gob shell -> exit 1 even with healthy-looking stats.
{
  const dir = makeDir({ searches: searches(10, 5) }, 384);
  const r = runCanary(['--dir', dir]);
  assert.strictEqual(r.status, 1, `tiny index.gob must exit 1, got ${r.status}`);
  assert.ok(r.stdout.includes('empty shell'), 'must name the empty-index problem');
}

// 4. --warn-only converts failure to exit 0 but still reports.
{
  const dir = makeDir({ searches: searches(20, 0) }, 384);
  const r = runCanary(['--dir', dir, '--warn-only']);
  assert.strictEqual(r.status, 0, `--warn-only must exit 0, got ${r.status}`);
  assert.ok(r.stdout.includes('UNHEALTHY'), 'warn-only must still say UNHEALTHY');
}

// 5. Missing stats + missing index: nothing to assert on -> healthy/no-op.
{
  const dir = makeDir(undefined, undefined);
  const r = runCanary(['--dir', dir]);
  assert.strictEqual(r.status, 0, `bare dir must exit 0, got ${r.status}`);
}

// 6. Visibility run against the real .grepai (never fails CI).
{
  const r = runCanary(['--dir', path.join(REPO, '.grepai'), '--warn-only']);
  assert.strictEqual(r.status, 0, 'warn-only visibility run must exit 0');
  console.log(r.stdout.trim());
}

console.log('grepai canary tests: PASS');
