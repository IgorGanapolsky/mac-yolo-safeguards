'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  selfTest,
  cosine,
  lexicalOverlap,
  significantQueryTokens,
  passageWindows,
  colbertLiteScore,
  crossEncoderScore,
  rerank,
} = require('../tools/retrieval-rerank');

function hashEmbed(text, dim = 32) {
  const v = new Array(dim).fill(0);
  const s = String(text || '').toLowerCase();
  for (let i = 0; i < s.length; i += 1) {
    const code = s.charCodeAt(i);
    v[code % dim] += 1;
    v[(code * 7 + i) % dim] += 0.3;
  }
  const norm = Math.sqrt(v.reduce((a, b) => a + b * b, 0)) || 1;
  return v.map((x) => x / norm);
}

const embedder = { embed: async (t) => hashEmbed(t) };

test('cosine is 1 for identical vectors', () => {
  assert.equal(cosine([1, 0], [1, 0]), 1);
  assert.ok(cosine([1, 0], [0, 1]) < 0.01);
});

test('lexicalOverlap rewards shared tokens', () => {
  assert.ok(lexicalOverlap('gateway session', 'gateway session recover') > 0.3);
  assert.equal(lexicalOverlap('abc', 'xyz'), 0);
});

test('significantQueryTokens drops stopwords', () => {
  const t = significantQueryTokens('the gateway session for the user');
  assert.ok(t.includes('gateway'));
  assert.ok(!t.includes('the'));
});

test('passageWindows covers long text', () => {
  const w = passageWindows('x'.repeat(900), 4, 200);
  assert.ok(w.length >= 2);
});

test('selfTest flips inverted RRF prior via CE and ColBERT', async () => {
  const report = await selfTest();
  assert.equal(report.ok, true);
  assert.match(report.cross_encoder_top, /hermes-cloud-connector/);
  assert.match(report.colbert_top, /hermes-cloud-connector/);
  assert.match(report.ensemble_top, /hermes-cloud-connector/);
});

test('crossEncoderScore prefers relevant path+snippet', async () => {
  const q = 'tailscale gateway session';
  const good = await crossEncoderScore(
    q,
    { path: 'tools/gateway.js', snippet: 'tailscale gateway session recover' },
    embedder,
  );
  const bad = await crossEncoderScore(
    q,
    { path: 'docs/pricing.md', snippet: 'stripe continuity funnel marketing' },
    embedder,
  );
  assert.ok(good.score > bad.score);
});

test('colbertLiteScore MaxSim prefers matching windows', async () => {
  const q = 'session recover';
  const good = await colbertLiteScore(
    q,
    { path: 'a.js', snippet: 'session recover reconnect path' },
    embedder,
  );
  const bad = await colbertLiteScore(
    q,
    { path: 'b.js', snippet: 'pricing discount newsletter promo' },
    embedder,
  );
  assert.ok(good.score > bad.score);
  assert.ok(good.components.maxSim >= 0);
});

test('ensemble rerank returns ranked matches', async () => {
  const out = await rerank({
    query: 'cloud connector session',
    candidates: [
      { path: 'noise.md', snippet: 'unrelated', rrfScore: 0.1 },
      { path: 'tools/hermes-cloud-connector.js', snippet: 'cloud connector session', rrfScore: 0.01 },
    ],
    strategy: 'ensemble',
    embedder,
    limit: 2,
  });
  assert.equal(out.ok, true);
  assert.equal(out.matches.length, 2);
  assert.ok(out.capabilities.cross_encoder);
  assert.ok(out.capabilities.colbert_lite);
  assert.ok(out.capabilities.llm_rerank);
});
