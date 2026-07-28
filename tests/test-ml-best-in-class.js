#!/usr/bin/env node
'use strict';

/**
 * July 2026 best-in-class ML platform tests (offline, pure JS).
 *   node tests/test-ml-best-in-class.js
 */

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const REPO = path.resolve(__dirname, '..');
const FIXTURE = path.join(REPO, 'tests/fixtures/ml/synthetic-labels.jsonl');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ml-bic-'));

function run(script, args) {
  return spawnSync(process.execPath, [path.join(REPO, script), ...args], {
    cwd: REPO,
    encoding: 'utf8',
    maxBuffer: 8 * 1024 * 1024,
  });
}

// --- ml-core metrics ---
{
  const core = require(path.join(REPO, 'tools/ml-core.js'));
  const rows = [
    { x: [1, 1, 1, 1, 1, 1, 1, 0, 1], label_paid: 1 },
    { x: [1, 1, 1, 1, 0, 1, 1, 0, 1], label_paid: 1 },
    { x: [0, 0, 0, 0, 0, 0, 0, 0, 0], label_paid: 0 },
    { x: [0, 0, 0, 0, 1, 0, 0, 0, 0], label_paid: 0 },
    { x: [1, 1, 1, 0, 1, 1, 1, 0, 1], label_paid: 1 },
    { x: [0, 0, 1, 0, 0, 0, 0, 1, 0], label_paid: 0 },
  ];
  const fit = core.trainLogistic(rows, { dim: 9 });
  const m = core.metrics(fit, rows);
  assert.ok(m.brier != null && m.brier >= 0 && m.brier <= 1);
  assert.ok(m.at_threshold && m.at_threshold.f1 != null);
  const cv = core.crossValidate(rows, 9, 3);
  assert.ok(cv.folds.length >= 1);
  const ndcg = core.ndcgAtK(
    ['tools/a.js', 'tools/b.js', 'docs/x.md'],
    ['tools/a.js'],
    3,
  );
  assert.ok(ndcg > 0.5);
  const ab = core.twoProportionTest(40, 100, 20, 100);
  assert.strictEqual(ab.significant, true);
  const under = core.twoProportionTest(1, 5, 0, 5);
  assert.ok(typeof under.z === 'number' || under.z === null);
}

// --- train with CV + Brier + calib + register ---
{
  const modelOut = path.join(tmp, 'model.json');
  // isolate registry under tmp via HOME override
  const home = path.join(tmp, 'home');
  fs.mkdirSync(path.join(home, '.hermes', 'ml'), { recursive: true });
  const result = spawnSync(
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
    {
      cwd: REPO,
      encoding: 'utf8',
      env: { ...process.env, HOME: home },
      maxBuffer: 8 * 1024 * 1024,
    },
  );
  assert.strictEqual(result.status, 0, result.stderr || result.stdout);
  const body = JSON.parse(result.stdout);
  assert.strictEqual(body.trained, true);
  assert.ok(body.holdout_metrics.brier != null);
  assert.ok(body.cv && body.cv.mean_auc != null);
  assert.ok(body.calibration);
  assert.ok(Array.isArray(body.feature_importance));
  const model = JSON.parse(fs.readFileSync(modelOut, 'utf8'));
  assert.strictEqual(model.schema_version, 'ml-propensity-model/2');
}

// --- registry promote + serve ---
{
  const home = path.join(tmp, 'home2');
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
    { cwd: REPO, encoding: 'utf8', env: { ...process.env, HOME: home } },
  );
  assert.strictEqual(train.status, 0, train.stderr || train.stdout);
  const regList = spawnSync(
    process.execPath,
    [path.join(REPO, 'tools/ml-registry.js'), 'list', '--json'],
    { cwd: REPO, encoding: 'utf8', env: { ...process.env, HOME: home } },
  );
  const list = JSON.parse(regList.stdout);
  assert.ok(list.models.length >= 1);
  const id = list.models[0].id;
  // Fixture models have tiny holdout — production promote requires --allow-toy
  const blocked = spawnSync(
    process.execPath,
    [path.join(REPO, 'tools/ml-registry.js'), 'promote', '--id', id, '--json'],
    { cwd: REPO, encoding: 'utf8', env: { ...process.env, HOME: home } },
  );
  const blockedBody = JSON.parse(blocked.stdout);
  assert.strictEqual(blockedBody.ok, false, 'fixture promote must be blocked without --allow-toy');
  assert.ok(
    (blockedBody.blockers || []).includes('perfect_auc_tiny_holdout_use_allow_toy') ||
      (blockedBody.blockers || []).includes('below_production_label_floor'),
  );

  const promote = spawnSync(
    process.execPath,
    [path.join(REPO, 'tools/ml-registry.js'), 'promote', '--id', id, '--allow-toy', '--json'],
    { cwd: REPO, encoding: 'utf8', env: { ...process.env, HOME: home } },
  );
  assert.strictEqual(promote.status, 0, promote.stderr || promote.stdout);
  const score = spawnSync(
    process.execPath,
    [
      path.join(REPO, 'tools/ml-serve.js'),
      'score',
      '--features',
      JSON.stringify({
        agent_stack: 'yes',
        repeated_failure: 'yes',
        business_cost: 'yes',
        budget_owner: 'yes',
        workflow_context: 'yes',
        needs_repeatability: 'yes',
        segment: 'agency',
        source: 'inbound',
      }),
      '--json',
    ],
    { cwd: REPO, encoding: 'utf8', env: { ...process.env, HOME: home } },
  );
  assert.strictEqual(score.status, 0, score.stderr || score.stdout);
  const scored = JSON.parse(score.stdout);
  assert.ok(scored.ok);
  assert.ok(scored.probability_paid >= 0 && scored.probability_paid <= 1);
}

// --- experiment significance gate ---
{
  const home = path.join(tmp, 'home3');
  fs.mkdirSync(path.join(home, '.hermes', 'ml'), { recursive: true });
  const env = { ...process.env, HOME: home };
  const create = spawnSync(
    process.execPath,
    [path.join(REPO, 'tools/ml-experiment.js'), 'create', '--id', 'bic-test', '--json'],
    { cwd: REPO, encoding: 'utf8', env },
  );
  assert.strictEqual(create.status, 0, create.stderr || create.stdout);
  // underpowered
  spawnSync(
    process.execPath,
    [
      path.join(REPO, 'tools/ml-experiment.js'),
      'record',
      '--id',
      'bic-test',
      '--arm',
      'a',
      '--success',
      '1',
      '--n',
      '5',
      '--json',
    ],
    { cwd: REPO, encoding: 'utf8', env },
  );
  spawnSync(
    process.execPath,
    [
      path.join(REPO, 'tools/ml-experiment.js'),
      'record',
      '--id',
      'bic-test',
      '--arm',
      'b',
      '--success',
      '0',
      '--n',
      '5',
      '--json',
    ],
    { cwd: REPO, encoding: 'utf8', env },
  );
  const under = spawnSync(
    process.execPath,
    [path.join(REPO, 'tools/ml-experiment.js'), 'analyze', '--id', 'bic-test', '--min-n', '30', '--json'],
    { cwd: REPO, encoding: 'utf8', env },
  );
  const underBody = JSON.parse(under.stdout);
  assert.strictEqual(underBody.decision, 'underpowered');

  // powered significant
  spawnSync(
    process.execPath,
    [
      path.join(REPO, 'tools/ml-experiment.js'),
      'record',
      '--id',
      'bic-test',
      '--arm',
      'a',
      '--success',
      '1',
      '--n',
      '40',
      '--json',
    ],
    { cwd: REPO, encoding: 'utf8', env },
  );
  spawnSync(
    process.execPath,
    [
      path.join(REPO, 'tools/ml-experiment.js'),
      'record',
      '--id',
      'bic-test',
      '--arm',
      'b',
      '--success',
      '0',
      '--n',
      '40',
      '--json',
    ],
    { cwd: REPO, encoding: 'utf8', env },
  );
  const powered = spawnSync(
    process.execPath,
    [path.join(REPO, 'tools/ml-experiment.js'), 'analyze', '--id', 'bic-test', '--min-n', '30', '--json'],
    { cwd: REPO, encoding: 'utf8', env },
  );
  const poweredBody = JSON.parse(powered.stdout);
  assert.ok(
    poweredBody.decision === 'declare_winner' || poweredBody.decision === 'no_significant_difference',
  );
  if (poweredBody.decision === 'declare_winner') {
    assert.strictEqual(poweredBody.winner, 'a');
  }
}

// --- RAG nDCG field present ---
{
  const rag = run('tools/rag-retrieval-eval.js', ['--json']);
  assert.strictEqual(rag.status, 0, rag.stderr || rag.stdout);
  const body = JSON.parse(rag.stdout);
  assert.ok(typeof body.meanNdcgAtK === 'number');
  assert.ok(body.meanNdcgAtK > 0);
  assert.ok(body.results[0].ndcgAtK != null);
}

// --- ml-gate platform ready (skip nested unit to avoid recursion) ---
{
  const gate = spawnSync(
    process.execPath,
    [path.join(REPO, 'tools/ml-gate.js'), '--json'],
    {
      cwd: REPO,
      encoding: 'utf8',
      env: { ...process.env, ML_GATE_SKIP_UNIT: '1' },
      maxBuffer: 8 * 1024 * 1024,
    },
  );
  assert.strictEqual(gate.status, 0, gate.stderr || gate.stdout);
  const body = JSON.parse(gate.stdout);
  assert.strictEqual(body.platform_ready, true, JSON.stringify(body.checks.filter((c) => !c.pass)));
  assert.strictEqual(body.production_ml_ready, false); // honest: no paid labels yet
  assert.ok(body.scores.platform_pct >= 90);
}

console.log('PASS tests/test-ml-best-in-class.js');
