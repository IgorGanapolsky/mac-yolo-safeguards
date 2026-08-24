'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { runEvalBenchmarkSuite } = require('../tools/eval-benchmark-suite');

function makeTemp(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'eval-benchmark-test-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

function pair(id) {
  return {
    id,
    prompt: `prompt-${id}`,
    chosen: `chosen-${id}`,
    rejected: `rejected-${id}`,
    source: 'human-feedback',
    timestamp: '2026-08-24T12:00:00.000Z',
  };
}

test('fails closed instead of inventing evaluation metrics', (t) => {
  const root = makeTemp(t);
  const result = runEvalBenchmarkSuite({
    cwd: root,
    inputPath: path.join(root, 'missing-memories.json'),
    outputPath: path.join(root, 'dpo.jsonl'),
    evidencePath: path.join(root, 'missing-evidence.json'),
    connectorTestPath: path.join(root, 'missing-test.js'),
    e2eProofPath: path.join(root, 'missing-e2e.json'),
    minPairs: 1,
  });

  assert.equal(result.status, 'insufficient_evidence');
  assert.equal(result.metrics.offlineEvals.status, 'not_measured');
  assert.equal(result.metrics.offlineEvals.passRatePct, null);
  assert.equal(result.metrics.onlineEvals.status, 'not_measured');
  assert.equal(result.metrics.llmAsAJudge.status, 'not_measured');
  assert.equal(result.metrics.dpoExport.status, 'insufficient_pairs');
  assert.equal(result.metrics.domainMetrics.mobileE2e.status, 'not_measured');
  assert.equal(result.metrics.domainMetrics.revenue.status, 'not_measured');
  assert.equal(fs.existsSync(path.join(root, 'dpo.jsonl')), false);
});

test('derives a ready disposition from explicit observed evidence', (t) => {
  const root = makeTemp(t);
  const inputPath = path.join(root, 'pairs.json');
  const outputPath = path.join(root, 'dpo.jsonl');
  const evidencePath = path.join(root, 'evidence.json');
  const e2eProofPath = path.join(root, 'e2e.json');
  const passingTestPath = path.join(root, 'passing.test.js');

  fs.writeFileSync(inputPath, JSON.stringify([pair('one'), pair('two')]));
  fs.writeFileSync(evidencePath, JSON.stringify({
    offlineCases: [
      { id: 'case-1', passed: true, source: 'holdout-v1' },
      { id: 'case-2', passed: true, source: 'holdout-v1' },
    ],
    onlineEvents: [
      { id: 'event-1', positive: true, source: 'human-thumb' },
      { id: 'event-2', positive: false, source: 'human-thumb' },
    ],
    judgeCases: [
      { id: 'judge-1', grounded: true, helpful: false, source: 'reviewer-v1' },
      { id: 'judge-2', grounded: true, helpful: true, source: 'reviewer-v1' },
    ],
  }));
  fs.writeFileSync(e2eProofPath, JSON.stringify({ e2e: 'pass', capturedAt: '2026-08-24T12:00:00.000Z' }));
  fs.writeFileSync(passingTestPath, "'use strict'; require('node:test')('passes', () => {});\n");

  const result = runEvalBenchmarkSuite({
    cwd: root,
    inputPath,
    outputPath,
    evidencePath,
    connectorTestPath: passingTestPath,
    e2eProofPath,
    minPairs: 2,
  });

  assert.equal(result.status, 'ready');
  assert.equal(result.metrics.offlineEvals.passRatePct, 100);
  assert.equal(result.metrics.onlineEvals.ratePct, 50);
  assert.equal(result.metrics.llmAsAJudge.groundedness.ratePct, 100);
  assert.equal(result.metrics.llmAsAJudge.helpfulness.ratePct, 50);
  assert.equal(result.metrics.regressionTesting.status, 'pass');
  assert.equal(result.metrics.dpoExport.totalExported, 2);
  assert.equal(result.metrics.domainMetrics.mobileE2e.status, 'pass');
  assert.equal(result.metrics.domainMetrics.revenue.status, 'not_measured');
});

test('an observed offline regression produces a failure', (t) => {
  const root = makeTemp(t);
  const evidencePath = path.join(root, 'evidence.json');
  fs.writeFileSync(evidencePath, JSON.stringify({
    offlineCases: [{ id: 'case-1', passed: false, source: 'holdout-v1' }],
  }));

  const result = runEvalBenchmarkSuite({
    cwd: root,
    inputPath: path.join(root, 'missing.json'),
    outputPath: path.join(root, 'dpo.jsonl'),
    evidencePath,
    connectorTestPath: null,
    e2eProofPath: path.join(root, 'missing-e2e.json'),
    minPairs: 1,
  });

  assert.equal(result.status, 'fail');
  assert.equal(result.metrics.offlineEvals.status, 'fail');
  assert.equal(result.metrics.offlineEvals.failed, 1);
});
