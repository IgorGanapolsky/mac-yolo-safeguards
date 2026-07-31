'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { letterFromScore, checkRerankQuality } = require('../tools/rag-stack-scorecard');

test('letterFromScore never awards A+ under hardFail or weak nDCG', () => {
  assert.equal(letterFromScore(0.99, true), 'B+');
  assert.equal(letterFromScore(0.99, false, { ndcg: 0.94 }), 'A+');
  assert.equal(letterFromScore(0.99, false, { ndcg: 0.9 }), 'A');
  assert.equal(letterFromScore(0.94, false, { ndcg: 0.99 }), 'A');
  assert.equal(letterFromScore(0.91, false), 'A-');
});

test('checkRerankQuality verifies rerank order and guards against regressed ranks', () => {
  assert.deepEqual(checkRerankQuality([]), { ok: true, detail: 'no matches to rerank' });
  const good = [
    { path: 'a.js', rerankScore: 0.95 },
    { path: 'b.js', rerankScore: 0.77 },
  ];
  assert.equal(checkRerankQuality(good).ok, true);
  const missing = [{ path: 'a.js' }, { path: 'b.js', rerankScore: 0.5 }];
  assert.equal(checkRerankQuality(missing).ok, false);
  const ascending = [{ path: 'a.js', rerankScore: 0.5 }, { path: 'b.js', rerankScore: 0.9 }];
  assert.equal(checkRerankQuality(ascending).ok, false);
});
