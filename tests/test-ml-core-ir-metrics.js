'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { mrrAtK, precisionAtK, recallAtK, ndcgAtK } = require('../tools/ml-core');

const ranked = [
  'docs/noise.md',
  'tools/hermes-cloud-connector.js',
  'apps/other.js',
];
const relevant = ['hermes-cloud-connector'];

test('mrrAtK is 1/rank of first hit', () => {
  assert.equal(mrrAtK(ranked, relevant, 3), 0.5);
  assert.equal(mrrAtK(['tools/hermes-cloud-connector.js'], relevant, 3), 1);
  assert.equal(mrrAtK(['docs/a.md'], relevant, 3), 0);
});

test('precisionAtK counts relevant fraction of top-k', () => {
  assert.equal(precisionAtK(ranked, relevant, 3), Number((1 / 3).toFixed(4)));
  assert.equal(precisionAtK(ranked, relevant, 1), 0);
  assert.equal(precisionAtK(['tools/hermes-cloud-connector.js', 'x.js'], relevant, 2), 0.5);
});

test('recallAtK is fraction of required labels hit', () => {
  assert.equal(recallAtK(ranked, relevant, 3), 1);
  assert.equal(recallAtK(ranked, ['missing'], 3), 0);
  assert.equal(recallAtK(ranked, ['hermes-cloud-connector', 'missing'], 3), 0.5);
});

test('ndcgAtK still works with binary labels', () => {
  const n = ndcgAtK(ranked, relevant, 3);
  assert.ok(n > 0 && n <= 1);
});
