'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { rrfFuse, rerankByRelevance, pathAllowed } = require('../tools/retrieval-dual-path');

test('rrfFuse boosts documents that appear in both lists', () => {
  const fused = rrfFuse([
    [
      { path: 'a.js', rank: 1, source: 'harness' },
      { path: 'b.js', rank: 2, source: 'harness' },
    ],
    [
      { path: 'b.js', rank: 1, source: 'grepai' },
      { path: 'c.js', rank: 2, source: 'grepai' },
    ],
  ]);
  assert.equal(fused[0].path, 'b.js', 'agreement across lists should rank first');
  assert.ok(fused[0].sources.includes('harness') && fused[0].sources.includes('grepai'));
  assert.ok(fused.find((m) => m.path === 'a.js'));
  assert.ok(fused.find((m) => m.path === 'c.js'));
});

test('pathAllowed enforces include and exclude', () => {
  assert.equal(pathAllowed('tools/foo.js', ['tools/'], []), true);
  assert.equal(pathAllowed('apps/foo.js', ['tools/'], []), false);
  assert.equal(pathAllowed('tools/test/foo.js', [], ['/test/']), false);
  assert.equal(pathAllowed('tools/foo.js', [], ['/test/']), true);
});

test('rerankByRelevance re-orders beyond RRF rank position using relevance', () => {
  // RRF ranks A first (0.1 > 0.06), but B is more relevant.
  const query = 'hermes cloud connector session recover';
  const A = { path: 'docs/guide.md', rrfScore: 0.1, score: 0, snippet: 'nothing relevant here', sources: ['harness'] };
  const B = { path: 'tools/hermes-retrieval-harness.js', rrfScore: 0.06, score: 5, snippet: 'the hermes cloud connector session recover procedure', sources: ['grepai'] };
  const r = rerankByRelevance([A, B], query);
  assert.equal(r[0].path, 'tools/hermes-retrieval-harness.js', 'relevant doc should outrank higher-RRF doc');
  assert.equal(r[1].path, 'docs/guide.md');
  assert.equal(r[0].rerankScore > r[1].rerankScore, true);
});

test('rerankByRelevance assigns rerankScore in [0,1], sorted desc with ranks', () => {
  const r = rerankByRelevance(
    [
      { path: 'a.js', rrfScore: 0.05, score: 1, snippet: 'alpha beta gamma' },
      { path: 'b.js', rrfScore: 0.09, score: 8, snippet: 'alpha beta gamma delta' },
    ],
    'alpha beta',
  );
  assert.equal(r.length, 2);
  r.forEach((m) => {
    assert.equal(typeof m.rerankScore, 'number');
    assert.equal(m.rerankScore >= 0 && m.rerankScore <= 1, true);
  });
  assert.equal(r[0].rerankScore >= r[1].rerankScore, true, 'must be descending');
  assert.deepEqual(r.map((m) => m.rerankRank), [1, 2]);
});

test('rerankByRelevance is deterministic for equal input', () => {
  const input = [
    { path: 'a.js', rrfScore: 0.1, score: 1, snippet: '' },
    { path: 'b.js', rrfScore: 0.1, score: 1, snippet: '' },
  ];
  const r1 = rerankByRelevance(input, 'query');
  const r2 = rerankByRelevance(input, 'query');
  assert.deepEqual(r1.map((m) => m.path), r2.map((m) => m.path));
});

test('rerankByRelevance empty input is a no-op', () => {
  assert.deepEqual(rerankByRelevance([], 'q'), []);
});
