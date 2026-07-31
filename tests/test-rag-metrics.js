'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  scoreRanking,
  answerRelevance,
  faithfulness,
  groundedness,
  scoreGeneration,
  crossEncoderLiteScore,
  rerankCrossEncoderLite,
  ndcg,
  dcg,
} = require('../tools/rag-metrics');

const idMatches = (a, b) => a === b;

test('recall / precision / MRR / nDCG on synthetic rankings', () => {
  const perfect = scoreRanking(['a', 'b', 'c'], ['a', 'b'], idMatches, { k: 3 });
  assert.equal(perfect.recallAtK, 1);
  assert.equal(perfect.precisionAtK, 2 / 3);
  assert.equal(perfect.reciprocalRank, 1);
  assert.ok(perfect.ndcgAtK > 0.9);

  const late = scoreRanking(['x', 'y', 'a'], ['a'], idMatches, { k: 3 });
  assert.equal(late.recallAtK, 1);
  assert.equal(late.precisionAtK, 1 / 3);
  assert.ok(Math.abs(late.reciprocalRank - 1 / 3) < 1e-12);
  assert.ok(late.ndcgAtK > 0 && late.ndcgAtK < 1);

  const miss = scoreRanking(['x', 'y'], ['a'], idMatches, { k: 2 });
  assert.equal(miss.recallAtK, 0);
  assert.equal(miss.precisionAtK, 0);
  assert.equal(miss.reciprocalRank, 0);
  assert.equal(miss.ndcgAtK, 0);
});

test('graded nDCG prefers higher grades at top ranks', () => {
  const gradesGood = [2, 1, 0];
  const gradesBad = [0, 1, 2];
  const ideal = [2, 1, 0];
  assert.ok(ndcg(gradesGood, ideal) > ndcg(gradesBad, ideal));
  assert.ok(dcg([1, 0]) > 0);
});

test('answer relevance is high for on-topic answers', () => {
  const hi = answerRelevance(
    'What is ThumbGate Continuity offline VPS?',
    'ThumbGate Continuity runs eligible work on a fenced offline VPS runner.',
  );
  const lo = answerRelevance(
    'What is ThumbGate Continuity offline VPS?',
    'The weather is sunny with coastal rain.',
  );
  assert.ok(hi > lo, `expected hi>${lo}, got ${hi}`);
  assert.ok(hi >= 0.15);
});

test('faithfulness and groundedness detect unsupported claims', () => {
  const sources = [
    'Continuity continues eligible Hermes work on a fenced VPS when the Mac is offline.',
  ];
  const good = 'Continuity continues eligible work on a fenced VPS when the Mac is offline.';
  const bad = 'Continuity is a Kubernetes GPU autoscaler with guaranteed uptime.';
  assert.ok(faithfulness(good, sources) > faithfulness(bad, sources));
  assert.ok(groundedness(good, sources) > groundedness(bad, sources));
});

test('scoreGeneration pass floors', () => {
  const sources = ['agent swarm harness planner worker plan.md AcceptanceCheck thrash'];
  const ok = scoreGeneration(
    'How does agent swarm harness coordinate?',
    'The agent swarm harness uses planner worker roles and plan.md AcceptanceCheck gates to prevent thrash.',
    sources,
    { minAnswerRelevance: 0.1, minFaithfulness: 0.4, minGroundedness: 0.3 },
  );
  assert.equal(ok.pass, true);

  const bad = scoreGeneration(
    'How does agent swarm harness coordinate?',
    'Bananas grow best in tropical climates with high humidity.',
    sources,
    { minAnswerRelevance: 0.15, minFaithfulness: 0.5, minGroundedness: 0.35 },
  );
  assert.equal(bad.pass, false);
});

test('cross-encoder-lite rerank promotes path/snippet matches', () => {
  const query = 'agent swarm harness thrash';
  const ranked = rerankCrossEncoderLite(query, [
    { path: 'docs/unrelated.md', snippet: 'weather patterns', rank: 1 },
    { path: 'tools/agent-swarm-harness.js', snippet: 'planner worker thrash megafile', rank: 2 },
  ]);
  assert.equal(ranked[0].path, 'tools/agent-swarm-harness.js');
  assert.ok(crossEncoderLiteScore(query, 'tools/agent-swarm-harness.js', 'thrash') > 0);
});
