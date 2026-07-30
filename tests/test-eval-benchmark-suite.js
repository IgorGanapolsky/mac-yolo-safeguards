'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const os = require('os');
const {
  runEvalBenchmarkSuite,
  buildHumanFeedbackMetrics,
} = require('../tools/eval-benchmark-suite');
const {
  assertNotFabricatedJudgeScores,
  FORBIDDEN_FABRICATED_SCORES,
  HUMAN_METRIC_SEMANTICS,
  hardGates,
} = require('../tools/llm-judge-policy');
const { curateEvalSet } = require('../tools/curate-eval-set');

const root = path.join(__dirname, '..');

test('eval benchmark suite reports structure without inventing green domain metrics', () => {
  // skipHardGates keeps the unit test fast; full hard gates run via CLI --strict in CI scripts.
  const results = runEvalBenchmarkSuite({ cwd: root, skipHardGates: true });

  assert.ok(results.timestamp);
  assert.equal(typeof results.durationMs, 'number');
  assert.equal(results.policy, 'hard-gates-deterministic-llm-judge-diagnostic-only');
  assert.ok(Array.isArray(results.hardGates));
  assert.ok(['pass', 'fail', 'skip'].includes(results.metrics.offlineEvals.status));
  assert.equal(results.metrics.offlineEvals.accuracyPct, null, 'must not invent accuracyPct');
  assert.equal(results.metrics.offlineEvals.promptDatasetSize, null);
  assert.equal(results.metrics.offlineEvals.latencyMs, null);
  assert.equal(typeof results.metrics.regressionTesting.preventionRulesActive, 'number');
  assert.ok(results.metrics.onlineEvals.continuousE2EStatus);
  // Domain metrics: null = unmeasured, never hardcoded true
  assert.ok(
    results.metrics.domainMetrics.revenuePipelineHealthy === null ||
      typeof results.metrics.domainMetrics.revenuePipelineHealthy === 'boolean',
  );
});

test('LLM-as-a-judge / human-label scores are never the old fabricated constants', () => {
  const results = runEvalBenchmarkSuite({ cwd: root, skipHardGates: true });
  const judge = results.metrics.llmAsAJudge;

  assert.notEqual(judge.groundednessScore, FORBIDDEN_FABRICATED_SCORES.groundednessScore);
  assert.notEqual(judge.helpfulnessScore, FORBIDDEN_FABRICATED_SCORES.helpfulnessScore);

  const check = assertNotFabricatedJudgeScores(judge);
  assert.equal(check.ok, true, check.violations.join('; '));

  assert.equal(typeof judge.groundednessScore, 'number');
  assert.equal(typeof judge.helpfulnessScore, 'number');
  assert.ok(judge.groundednessScore >= 0 && judge.groundednessScore <= 1);
  assert.ok(judge.helpfulnessScore >= 0 && judge.helpfulnessScore <= 1);
  assert.equal(typeof judge.dpoPairsExported, 'number');
  assert.equal(judge.role, HUMAN_METRIC_SEMANTICS.role);
  assert.ok(judge.metricSemantics, 'metricSemantics must document honest names');
});

test('when human labels exist, scores match curate-eval-set and carry provenance', () => {
  const logPath = path.join(process.env.HOME || '', '.thumbgate', 'feedback-log.jsonl');
  if (!fs.existsSync(logPath)) {
    // Skip-shaped: still assert insufficient-data path is honest
    const judge = buildHumanFeedbackMetrics(0);
    assert.equal(judge.status, 'insufficient-data');
    assert.equal(judge.humanLabelsUsed, 0);
    return;
  }

  const results = runEvalBenchmarkSuite({ cwd: root, skipHardGates: true });
  const judge = results.metrics.llmAsAJudge;
  if (judge.humanLabelsUsed <= 0) return;

  assert.equal(typeof judge.evalSetSha256, 'string');
  assert.equal(judge.evalSetSha256.length, 64);
  assert.match(judge.evalSetSha256, /^[0-9a-f]{64}$/);
  assert.match(String(judge.labelSource || ''), /human/i);
  assert.equal(typeof judge.rejectedBreakdown, 'object');

  const curate = curateEvalSet({ logPath });
  if (curate.ok && curate.counts.kept > 0) {
    const expected = Number((curate.counts.keptPositive / curate.counts.kept).toFixed(4));
    assert.equal(judge.humanPositiveRate, expected);
    assert.equal(judge.groundednessScore, expected, 'legacy alias must match humanPositiveRate');
  }
});

test('policy hard gates are deterministic (no LLM command required)', () => {
  for (const g of hardGates()) {
    assert.equal(g.class, 'hard');
    assert.ok(g.command, `${g.id} must have a deterministic command`);
    assert.doesNotMatch(g.command, /openai|anthropic|judge-model|gpt-/i);
  }
});

test('fabricated score detector catches the historical constants', () => {
  const bad = assertNotFabricatedJudgeScores({
    groundednessScore: 0.98,
    helpfulnessScore: 0.96,
  });
  assert.equal(bad.ok, false);
  assert.ok(bad.violations.length >= 2);
});
