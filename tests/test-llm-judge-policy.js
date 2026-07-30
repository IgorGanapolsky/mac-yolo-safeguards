'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  GATES,
  hardGates,
  diagnosticGates,
  assertNotFabricatedJudgeScores,
  HUMAN_METRIC_SEMANTICS,
} = require('../tools/llm-judge-policy');

test('every gate is hard or diagnostic', () => {
  for (const g of GATES) {
    assert.ok(g.id && g.why);
    assert.ok(g.class === 'hard' || g.class === 'diagnostic', g.id);
  }
  assert.ok(hardGates().length >= 2);
  assert.ok(diagnosticGates().some((g) => g.id === 'llm-judge-scores'));
});

test('llm-judge-scores gate is diagnostic only (never merge-blocking alone)', () => {
  const j = GATES.find((g) => g.id === 'llm-judge-scores');
  assert.ok(j);
  assert.equal(j.class, 'diagnostic');
  assert.equal(j.command, null);
});

test('human metric semantics forbid model-self-grade interpretation', () => {
  assert.match(HUMAN_METRIC_SEMANTICS.role, /not-llm-judge/);
  assert.match(HUMAN_METRIC_SEMANTICS.humanPositiveRate, /NOT model groundedness/i);
  assert.match(HUMAN_METRIC_SEMANTICS.holdoutFraction, /NOT model helpfulness/i);
});

test('assertNotFabricatedJudgeScores passes clean scores', () => {
  const r = assertNotFabricatedJudgeScores({ groundednessScore: 0.41, helpfulnessScore: 0.3 });
  assert.equal(r.ok, true);
});
