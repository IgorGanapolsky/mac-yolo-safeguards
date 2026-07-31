#!/usr/bin/env node
'use strict';

/**
 * Offline tests for the July 2026 ML baseline (labels → train → scores).
 *   node tests/test-ml-stack.js
 */

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const REPO = path.resolve(__dirname, '..');
const FIXTURE = path.join(REPO, 'tests/fixtures/ml/synthetic-labels.jsonl');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ml-stack-'));

function run(script, args) {
  const result = spawnSync(process.execPath, [path.join(REPO, script), ...args], {
    cwd: REPO,
    encoding: 'utf8',
    maxBuffer: 8 * 1024 * 1024,
  });
  return result;
}

function parseJsonStdout(result) {
  assert.strictEqual(result.status, 0, result.stderr || result.stdout);
  return JSON.parse(result.stdout);
}

// --- label store ---
{
  const labelsOut = path.join(tmp, 'labels.jsonl');
  const summaryOut = path.join(tmp, 'summary.json');
  const result = run('tools/ml-label-store.js', [
    'export',
    '--fixture',
    FIXTURE,
    '--out',
    labelsOut,
    '--summary-out',
    summaryOut,
    '--json',
  ]);
  const body = parseJsonStdout(result);
  assert.ok(body.summary.training_eligible >= 20, 'expected >=20 training rows from fixture');
  assert.ok(body.summary.positives >= 5, 'expected >=5 positives');
  assert.strictEqual(body.summary.train_ready, true);
  assert.ok(fs.existsSync(labelsOut));
}

// --- train on fixture ---
{
  const labelsOut = path.join(tmp, 'labels.jsonl');
  const modelOut = path.join(tmp, 'model.json');
  // re-export to labelsOut already done; train
  const result = run('tools/ml-propensity-train.js', [
    'train',
    '--labels',
    labelsOut,
    '--out',
    modelOut,
    '--json',
  ]);
  const body = parseJsonStdout(result);
  assert.strictEqual(body.trained, true, JSON.stringify(body));
  assert.strictEqual(body.ok, true);
  assert.ok(body.holdout_metrics);
  const model = JSON.parse(fs.readFileSync(modelOut, 'utf8'));
  assert.strictEqual(model.trained, true);
  assert.ok(Array.isArray(model.weights));
  assert.strictEqual(model.weights.length, 9);
}

// --- score with trained model ---
{
  const modelOut = path.join(tmp, 'model.json');
  const result = run('tools/ml-propensity-train.js', [
    'score',
    '--out',
    modelOut,
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
  ]);
  const body = parseJsonStdout(result);
  assert.ok(body.ok);
  assert.ok(typeof body.probability_paid === 'number');
  assert.ok(body.probability_paid >= 0 && body.probability_paid <= 1);
}

// --- fail-closed insufficient labels ---
{
  const empty = path.join(tmp, 'empty.jsonl');
  fs.writeFileSync(empty, '');
  const modelOut = path.join(tmp, 'empty-model.json');
  const result = run('tools/ml-propensity-train.js', [
    'train',
    '--labels',
    empty,
    '--out',
    modelOut,
    '--json',
  ]);
  // exit code may be 2
  const body = JSON.parse(result.stdout);
  assert.strictEqual(body.trained, false);
  assert.strictEqual(body.status, 'insufficient_labels');
  const model = JSON.parse(fs.readFileSync(modelOut, 'utf8'));
  assert.strictEqual(model.trained, false);
}

// --- pure unit: logistic metrics with separable data ---
{
  const { trainLogistic, metrics, predictProba } = require(path.join(
    REPO,
    'tools/ml-propensity-train.js',
  ));
  const rows = [
    { x: [1, 1, 1, 1, 1, 1, 1, 0, 1], label_paid: 1 },
    { x: [1, 1, 1, 1, 0, 1, 1, 0, 1], label_paid: 1 },
    { x: [0, 0, 0, 0, 0, 0, 0, 0, 0], label_paid: 0 },
    { x: [0, 0, 0, 0, 1, 0, 0, 0, 0], label_paid: 0 },
  ];
  const fit = trainLogistic(rows);
  const m = metrics(fit, rows);
  assert.ok(m.accuracy >= 0.5);
  assert.ok(predictProba(fit, rows[0].x) > predictProba(fit, rows[2].x));
}

// --- system scores produces a line ---
{
  const result = run('tools/ml-system-scores.js', ['--json']);
  assert.strictEqual(result.status, 0, result.stderr || result.stdout);
  const body = JSON.parse(result.stdout);
  assert.ok(body.system_scores_line.includes('DS '));
  assert.ok(body.system_scores_line.includes('ML '));
  assert.ok(body.system_scores_line.includes('RAG '));
  assert.ok(body.parts.ml.score >= 0);
}

// --- RAG expanded fixtures still green ---
{
  const result = run('tools/rag-retrieval-eval.js', ['--json']);
  assert.strictEqual(result.status, 0, result.stderr || result.stdout);
  const body = JSON.parse(result.stdout);
  assert.ok(body.caseCount >= 8, `expected expanded RAG cases, got ${body.caseCount}`);
  assert.strictEqual(body.ok, true, JSON.stringify(body.results.filter((r) => !r.pass)));
}

// --- ability catalog includes ml_labels_fail_closed ---
{
  const { evalAbilityPolicy, matchAbilityForFailure } = require(path.join(
    REPO,
    'tools/agent-swarm-harness.js',
  ));
  const policy = evalAbilityPolicy();
  assert.ok(policy.abilities.some((a) => a.id === 'ml_labels_fail_closed'));
  const m = matchAbilityForFailure('propensity invent AUC insufficient labels');
  assert.ok(m.ability);
  assert.strictEqual(m.ability.id, 'ml_labels_fail_closed');
}

console.log('PASS tests/test-ml-stack.js');
