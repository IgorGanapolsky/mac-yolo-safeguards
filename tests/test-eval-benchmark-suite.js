'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { runEvalBenchmarkSuite } = require('../tools/eval-benchmark-suite');

test('eval benchmark suite runs and reports metrics across all 5 dimensions', () => {
  const root = path.join(__dirname, '..');
  const results = runEvalBenchmarkSuite({ cwd: root });

  assert.ok(results.timestamp);
  assert.equal(typeof results.durationMs, 'number');
  assert.equal(results.metrics.offlineEvals.status, 'pass');
  assert.equal(typeof results.metrics.regressionTesting.preventionRulesActive, 'number');
  assert.ok(results.metrics.onlineEvals.continuousE2EStatus);
  assert.equal(results.metrics.domainMetrics.codingTestsPassed, true);
});

test('LLM-as-a-judge scores are real, not hardcoded constants', () => {
  const root = path.join(__dirname, '..');
  const results = runEvalBenchmarkSuite({ cwd: root });
  const judge = results.metrics.llmAsAJudge;

  // Anti-regression: scores must NOT be the old fabricated values
  assert.notEqual(judge.groundednessScore, 0.98,
    'groundednessScore must not be the old hardcoded 0.98');
  assert.notEqual(judge.helpfulnessScore, 0.96,
    'helpfulnessScore must not be the old hardcoded 0.96');

  // Structural validity
  assert.equal(typeof judge.groundednessScore, 'number');
  assert.equal(typeof judge.helpfulnessScore, 'number');
  assert.ok(judge.groundednessScore >= 0 && judge.groundednessScore <= 1);
  assert.ok(judge.helpfulnessScore >= 0 && judge.helpfulnessScore <= 1);
  assert.equal(typeof judge.dpoPairsExported, 'number');

  // When human labels exist, provenance must be traceable
  if (judge.humanLabelsUsed > 0) {
    assert.equal(typeof judge.evalSetSha256, 'string');
    assert.equal(judge.evalSetSha256.length, 64, 'sha256 must be 64 hex chars');
    assert.match(judge.evalSetSha256, /^[0-9a-f]{64}$/, 'sha256 must be valid hex');
    assert.ok(judge.labelSource, 'labelSource must be populated');
    assert.match(judge.labelSource, /human/i, 'labels must come from humans, not models');
    assert.equal(typeof judge.rejectedBreakdown, 'object',
      'rejected breakdown must be present when labels exist');

    // Groundedness score must equal positive/kept ratio (not a model self-grade)
    // Re-verify the score matches curate-eval-set's computation
    const { curateEvalSet } = require('../tools/curate-eval-set');
    const curate = curateEvalSet({
      logPath: path.join(process.env.HOME || '', '.thumbgate', 'feedback-log.jsonl'),
    });
    if (curate.ok && curate.counts.kept > 0) {
      const expectedGroundedness = Number((curate.counts.keptPositive / curate.counts.kept).toFixed(4));
      assert.equal(judge.groundednessScore, expectedGroundedness,
        'groundednessScore must match real positive/kept ratio from curate-eval-set');
    }
  }
});

test('onlineEvals thumbsUpRatePct is real, not hardcoded 100', () => {
  const root = path.join(__dirname, '..');
  const results = runEvalBenchmarkSuite({ cwd: root });
  const online = results.metrics.onlineEvals;

  // Anti-regression: must NOT be the old hardcoded 100
  assert.notEqual(online.thumbsUpRatePct, 100,
    'thumbsUpRatePct must not be the old hardcoded 100');

  // Structural validity
  assert.equal(typeof online.thumbsUpRatePct, 'number');
  assert.ok(online.thumbsUpRatePct >= 0 && online.thumbsUpRatePct <= 100);

  // When human labels exist, thumbsUpRate must match curate-eval-set's precision
  if (online.humanLabelsUsed > 0) {
    const { curateEvalSet } = require('../tools/curate-eval-set');
    const curate = curateEvalSet({
      logPath: path.join(process.env.HOME || '', '.thumbgate', 'feedback-log.jsonl'),
    });
    if (curate.ok && curate.counts.kept > 0) {
      const expectedRate = Number((curate.counts.keptPositive / curate.counts.kept * 100).toFixed(1));
      assert.equal(online.thumbsUpRatePct, expectedRate,
        'thumbsUpRatePct must match real positive/kept ratio from curate-eval-set');
    }
  }
});

test('continuousE2EStatus is read from proof file, not hardcoded pass', () => {
  const root = path.join(__dirname, '..');
  const results = runEvalBenchmarkSuite({ cwd: root });
  const online = results.metrics.onlineEvals;

  const e2eProofPath = path.join(root, 'hermes-mobile', 'docs', 'proofs', 'continuous', 'latest.json');
  if (fs.existsSync(e2eProofPath)) {
    const proof = JSON.parse(fs.readFileSync(e2eProofPath, 'utf8'));
    // If the proof file has slo='yellow' or slo='red', the status must NOT be 'pass'
    if (proof.slo === 'yellow') {
      assert.notEqual(online.continuousE2EStatus, 'pass',
        'E2E status must not be pass when slo is yellow');
      assert.notEqual(online.status, 'pass',
        'onlineEvals.status must not be pass when E2E is yellow');
    }
    if (proof.slo === 'red') {
      assert.equal(online.continuousE2EStatus, 'fail',
        'E2E status must be fail when slo is red');
    }
    // The status must come from the proof file, not the old fallback
    if (proof.slo === 'green') {
      assert.equal(online.continuousE2EStatus, 'pass',
        'E2E status must be pass when slo is green');
    }
  }
});
