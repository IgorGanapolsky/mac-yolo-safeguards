'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { evaluateGrepaiGate, letterFromScore } = require('../tools/rag-stack-scorecard');

test('letterFromScore never awards A+ under hardFail or weak nDCG', () => {
  assert.equal(letterFromScore(0.99, true), 'B+');
  assert.equal(letterFromScore(0.99, false, { ndcg: 0.94 }), 'A+');
  assert.equal(letterFromScore(0.99, false, { ndcg: 0.9 }), 'A');
  assert.equal(letterFromScore(0.94, false, { ndcg: 0.99 }), 'A');
  assert.equal(letterFromScore(0.91, false), 'A-');
});

test('grepai gate requires retrieval bytes and an exact source-bound generation', () => {
  const generation = {
    ok: true,
    generationId: 'gen-a',
    indexedSha: 'a'.repeat(40),
    receipt: { indexSha256: '1'.repeat(64) },
  };
  const canary = {
    ok: true,
    hits: 2,
    generationId: 'gen-a',
    indexedSha: 'a'.repeat(40),
    indexSha256: '1'.repeat(64),
  };
  assert.equal(evaluateGrepaiGate(canary, generation).ok, true);
  assert.equal(evaluateGrepaiGate(canary, { ok: false }).ok, false);
  assert.equal(evaluateGrepaiGate({ ...canary, hits: 0 }, generation).ok, false);
  assert.equal(evaluateGrepaiGate(canary, { ...generation, indexedSha: 'not-a-sha' }).ok, false);
  assert.equal(
    evaluateGrepaiGate({ ...canary, indexSha256: '2'.repeat(64) }, generation).ok,
    false,
  );
  assert.equal(evaluateGrepaiGate({ ...canary, indexSha256: undefined }, generation).ok, false);
  assert.equal(
    evaluateGrepaiGate(canary, { ...generation, receipt: {} }).ok,
    false,
  );
});
