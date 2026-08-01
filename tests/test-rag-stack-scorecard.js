'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { letterFromScore } = require('../tools/rag-stack-scorecard');

test('letterFromScore never awards A+ under hardFail or weak nDCG', () => {
  assert.equal(letterFromScore(0.99, true), 'B+');
  assert.equal(letterFromScore(0.99, false, { ndcg: 0.94 }), 'A+');
  assert.equal(letterFromScore(0.99, false, { ndcg: 0.9 }), 'A');
  assert.equal(letterFromScore(0.94, false, { ndcg: 0.99 }), 'A');
  assert.equal(letterFromScore(0.91, false), 'A-');
});
