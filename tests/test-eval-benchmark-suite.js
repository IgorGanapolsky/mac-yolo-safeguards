'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { runEvalBenchmarkSuite } = require('../tools/eval-benchmark-suite');

test('eval benchmark suite measures retrieval + generation (no fabricated scores)', () => {
  const root = path.join(__dirname, '..');
  const results = runEvalBenchmarkSuite({ cwd: root });

  assert.ok(results.timestamp);
  assert.equal(typeof results.durationMs, 'number');

  const { retrieval, generation } = results.metrics;
  assert.equal(retrieval.measured, true, 'retrieval must be measured');
  assert.equal(retrieval.ok, true, `retrieval failed: ${JSON.stringify(retrieval)}`);
  assert.equal(typeof retrieval.meanRecallAtK, 'number');
  assert.equal(typeof retrieval.meanPrecisionAtK, 'number');
  assert.equal(typeof retrieval.meanMRR, 'number');
  assert.equal(typeof retrieval.meanNdcgAtK, 'number');
  assert.ok(retrieval.meanRecallAtK >= 0.99);
  assert.ok(retrieval.meanNdcgAtK <= 1, 'nDCG must be capped at 1');
  assert.ok(retrieval.meanMRR >= 0.9);

  assert.equal(generation.measured, true, 'generation must be measured');
  assert.equal(generation.ok, true, `generation failed: ${JSON.stringify(generation)}`);
  assert.equal(typeof generation.meanFaithfulness, 'number');
  assert.equal(typeof generation.meanGroundedness, 'number');
  assert.equal(typeof generation.meanAnswerRelevance, 'number');

  // Anti-fabrication: no legacy constant score keys.
  const blob = JSON.stringify(results);
  assert.ok(!blob.includes('groundednessScore'), 'must not emit fabricated groundednessScore');
  assert.ok(!blob.includes('LangSmith'), 'must not claim vendor parity');
  assert.equal(results.frameworkEquivalence, undefined);
});
