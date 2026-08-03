#!/usr/bin/env node
'use strict';

/**
 * Maniac ML integrity tests — theater detection, promote gates, vacuity.
 *   node tests/test-ml-integrity.js
 */

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const REPO = path.resolve(__dirname, '..');
const FIXTURE = path.join(REPO, 'tests/fixtures/ml/synthetic-labels.jsonl');
const integrity = require(path.join(REPO, 'tools/ml-integrity.js'));

// --- corrupt trained model rejected ---
{
  const bad = {
    schema_version: 'ml-propensity-model/2',
    trained: true,
    status: 'trained',
    weights: [],
    bias: 0,
  };
  const v = integrity.validateModel(bad);
  assert.strictEqual(v.ok, false);
  assert.ok(v.findings.some((f) => f.code === 'trained_without_weights'));
}

// --- contradiction trained + insufficient ---
{
  const bad = {
    schema_version: 'ml-propensity-model/2',
    trained: true,
    status: 'insufficient_labels',
    weights: [0.1],
    bias: 0,
    holdout_metrics: { auc: 0.5, brier: 0.25, n: 10 },
    cv: { mean_auc: 0.5 },
  };
  const v = integrity.validateModel(bad);
  assert.strictEqual(v.ok, false);
  assert.ok(v.findings.some((f) => f.code === 'trained_vs_status_contradiction'));
}

// --- insufficient_labels is ok ---
{
  const ok = {
    schema_version: 'ml-propensity-model/2',
    trained: false,
    status: 'insufficient_labels',
  };
  const v = integrity.validateModel(ok);
  assert.strictEqual(v.ok, true);
}

// --- perfect auc tiny holdout warns / blocks promote ---
{
  const toy = {
    schema_version: 'ml-propensity-model/2',
    trained: true,
    status: 'trained',
    weights: [1, 0, 0, 0, 0, 0, 0, 0, 0],
    bias: 0,
    positives: 8,
    total: 22,
    holdout_metrics: { auc: 1, brier: 0.01, n: 4, pos: 2, neg: 2 },
    cv: { mean_auc: 1 },
    calibration: { fitted: true, a: 1, b: 0 },
  };
  const v = integrity.validateModel(toy, { allowToy: false });
  assert.ok(v.findings.some((f) => f.code === 'perfect_auc_tiny_holdout'));
  const promote = integrity.canPromote(toy, { allowToy: false });
  assert.strictEqual(promote.ok, false);
  assert.ok(promote.blockers.includes('perfect_auc_tiny_holdout_use_allow_toy'));
  const allow = integrity.canPromote(toy, { allowToy: true });
  assert.strictEqual(allow.ok, true);
}

// --- claim scanner ---
{
  const bad = integrity.scanClaim('Our best-in-class production ML model has 100% auc');
  assert.strictEqual(bad.ok, false);
  assert.ok(bad.hits.length >= 1);
  const good = integrity.scanClaim(
    'Platform ready at founder-platform bar; production_ml_ready=false until labels',
  );
  assert.strictEqual(good.ok, true);
}

// --- vacuity: empty train must not produce trained=true ---
{
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ml-vacuity-'));
  const empty = path.join(tmp, 'empty.jsonl');
  fs.writeFileSync(empty, '');
  const out = path.join(tmp, 'model.json');
  const r = spawnSync(
    process.execPath,
    [path.join(REPO, 'tools/ml-propensity-train.js'), 'train', '--labels', empty, '--out', out, '--json'],
    { cwd: REPO, encoding: 'utf8' },
  );
  assert.notStrictEqual(r.status, 0, 'empty train must non-zero exit');
  const body = JSON.parse(r.stdout);
  assert.strictEqual(body.trained, false);
  assert.strictEqual(body.status, 'insufficient_labels');
  const disk = JSON.parse(fs.readFileSync(out, 'utf8'));
  assert.strictEqual(disk.trained, false);
}

// --- mutation control: if someone forced trained=true with empty weights, integrity fails ---
{
  const forged = {
    schema_version: 'ml-propensity-model/2',
    trained: true,
    status: 'trained',
    weights: [1, 1, 1],
    bias: 0,
    // missing holdout intentionally
  };
  const v = integrity.validateModel(forged);
  assert.strictEqual(v.ok, false);
  assert.ok(v.findings.some((f) => f.code === 'missing_holdout_auc'));
}

// --- CLI audit / scan-claim exit codes ---
{
  const scan = spawnSync(
    process.execPath,
    [
      path.join(REPO, 'tools/ml-integrity.js'),
      'scan-claim',
      '--text',
      'guaranteed revenue from production-ready ML',
      '--json',
    ],
    { cwd: REPO, encoding: 'utf8' },
  );
  assert.notStrictEqual(scan.status, 0);
  const body = JSON.parse(scan.stdout);
  assert.strictEqual(body.ok, false);
}

// --- promote without allow-toy blocked for fixture model ---
{
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'ml-int-home-'));
  const env = { ...process.env, HOME: home };
  fs.mkdirSync(path.join(home, '.hermes', 'ml'), { recursive: true });
  const modelOut = path.join(home, '.hermes', 'ml', 'propensity-model.json');
  const train = spawnSync(
    process.execPath,
    [
      path.join(REPO, 'tools/ml-propensity-train.js'),
      'train',
      '--labels',
      FIXTURE,
      '--out',
      modelOut,
      '--register',
      '--json',
    ],
    { cwd: REPO, encoding: 'utf8', env },
  );
  assert.strictEqual(train.status, 0, train.stderr || train.stdout);
  const list = JSON.parse(
    spawnSync(process.execPath, [path.join(REPO, 'tools/ml-registry.js'), 'list', '--json'], {
      cwd: REPO,
      encoding: 'utf8',
      env,
    }).stdout,
  );
  const id = list.models[0].id;
  const blocked = spawnSync(
    process.execPath,
    [path.join(REPO, 'tools/ml-registry.js'), 'promote', '--id', id, '--json'],
    { cwd: REPO, encoding: 'utf8', env },
  );
  assert.notStrictEqual(blocked.status, 0);
  const bb = JSON.parse(blocked.stdout);
  assert.strictEqual(bb.ok, false);
  assert.strictEqual(bb.error, 'promote_blocked_by_integrity');
}

console.log('PASS tests/test-ml-integrity.js');
