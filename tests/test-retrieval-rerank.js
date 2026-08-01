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
  RerankCache,
  RerankCacheInstance,
  rerankCacheKey,
  rerankSnapshot,
  cacheEnabled,
  clearRerankCache,
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

test('rerankCacheKey is deterministic, set-order-insensitive, and strategy/llm-isolating', () => {
  clearRerankCache();
  const cands = [
    { path: 'b.js', snippet: 'beta', rrfScore: 0.02 },
    { path: 'a.js', snippet: 'alpha', rrfScore: 0.1 },
  ];
  const k1 = rerankCacheKey({ query: 'q', strategy: 'ensemble', limit: 5, llm: false, candidates: cands });
  // Same set, different array order -> identical key (order-insensitive fingerprint)
  const k1b = rerankCacheKey({ query: 'q', strategy: 'ensemble', limit: 5, llm: false, candidates: [...cands].reverse() });
  assert.equal(k1, k1b);
  // Different strategy / llm flag / query -> different key
  assert.notEqual(k1, rerankCacheKey({ query: 'q', strategy: 'cross_encoder', limit: 5, llm: false, candidates: cands }));
  assert.notEqual(k1, rerankCacheKey({ query: 'q', strategy: 'ensemble', limit: 5, llm: true, candidates: cands }));
  assert.notEqual(k1, rerankCacheKey({ query: 'q2', strategy: 'ensemble', limit: 5, llm: false, candidates: cands }));
  clearRerankCache();
});

test('RerankCache enforces LRU eviction (oldest evicted, recent kept)', () => {
  const c = new RerankCache({ maxSize: 2, ttlMs: 0 }); // ttlMs=0 disables expiry -> LRU only
  c.set('a', 1);
  c.set('b', 2);
  assert.equal(c.get('a'), 1); // touch 'a' -> 'a' most-recent, 'b' oldest
  c.set('c', 3); // overflow -> evict oldest ('b')
  assert.equal(c.size(), 2);
  assert.equal(c.get('b'), undefined);
  assert.equal(c.get('a'), 1);
  assert.equal(c.get('c'), 3);
});

test('RerankCache honors TTL (expired entry is a miss and is evicted)', () => {
  let t = 1000;
  const c = new RerankCache({ maxSize: 10, ttlMs: 1000, now: () => t });
  c.set('x', 'v');
  assert.equal(c.get('x'), 'v'); // fresh
  t = 1999;
  assert.equal(c.get('x'), 'v'); // within TTL
  t = 2001; // past TTL
  assert.equal(c.get('x'), undefined); // expired -> miss + evicted
  assert.equal(c.size(), 0);
});

test('rerank does not write to cache when an embedder is injected (test-mode safety)', async () => {
  clearRerankCache();
  let callCount = 0;
  const countingEmbedder = {
    embed: async (t) => { callCount += 1; return hashEmbed(t); },
  };
  const cands = [
    { path: 'a.js', snippet: 'alpha', rrfScore: 0.1 },
    { path: 'b.js', snippet: 'beta', rrfScore: 0.05 },
  ];
  // Same query/candidates twice with an injected (fake) embedder.
  const r1 = await rerank({ query: 'alpha beta', candidates: cands, strategy: 'cross_encoder', embedder: countingEmbedder, limit: 2 });
  const r2 = await rerank({ query: 'alpha beta', candidates: cands, strategy: 'cross_encoder', embedder: countingEmbedder, limit: 2 });
  assert.equal(r1.cacheHit, false);
  assert.equal(r2.cacheHit, false);
  assert.equal(RerankCacheInstance.size(), 0, 'fake-vector results must not persist to the shared cache');
  assert.ok(callCount > 0, 'embedder was actually invoked (no cache short-circuit)');
});

test('rerank returns a cached hit on a repeated identical production call (no inject)', async () => {
  clearRerankCache();
  const cands = [
    { path: 'a.js', snippet: 'alpha', rrfScore: 0.1 },
    { path: 'b.js', snippet: 'beta', rrfScore: 0.05 },
  ];
  const key = rerankCacheKey({ query: 'alpha beta', strategy: 'ensemble', limit: 2, llm: false, candidates: cands });
  // Seed the cache exactly as rerank() would on a miss (rerankSnapshot strips run-only fields).
  const seeded = rerankSnapshot({
    ok: true,
    query: 'alpha beta',
    strategy: 'ensemble',
    llmApplied: false,
    llmError: undefined,
    matchCount: 2,
    matches: [{ path: 'a.js', rerankScore: 0.9, rank: 1 }, { path: 'b.js', rerankScore: 0.1, rank: 2 }],
    capabilities: { cross_encoder: true, colbert_lite: true, llm_rerank: true, ensemble: true },
  });
  RerankCacheInstance.set(key, seeded);
  // No embedder/chat -> production cache-read path (no Ollama invoked on hit).
  const out = await rerank({ query: 'alpha beta', candidates: cands, strategy: 'ensemble', limit: 2 });
  assert.equal(out.cacheHit, true);
  assert.equal(out.elapsedMs, 0);
  assert.equal(out.matches.length, 2);
  assert.equal(out.matches[0].path, 'a.js');
  // Cached matches are cloned on read -> mutating the returned array must not corrupt the cache.
  out.matches.push({ path: 'HACKED', rerankScore: 9, rank: 3 });
  out.matches[0].path = 'MUTATED';
  const again = await rerank({ query: 'alpha beta', candidates: cands, strategy: 'ensemble', limit: 2 });
  assert.equal(again.cacheHit, true);
  assert.equal(again.matches.length, 2);
  assert.equal(again.matches[0].path, 'a.js');
  clearRerankCache();
});

test('cacheEnabled respects disableCache option and HERMES_RERANK_NO_CACHE env', () => {
  assert.equal(cacheEnabled({}), true);
  assert.equal(cacheEnabled({ disableCache: true }), false);
  const prev = process.env.HERMES_RERANK_NO_CACHE;
  try {
    process.env.HERMES_RERANK_NO_CACHE = '1';
    assert.equal(cacheEnabled({}), false);
    assert.equal(cacheEnabled({ disableCache: true }), false);
  } finally {
    if (prev === undefined) delete process.env.HERMES_RERANK_NO_CACHE;
    else process.env.HERMES_RERANK_NO_CACHE = prev;
  }
  assert.equal(cacheEnabled({}), true);
});

test('clearRerankCache empties the shared instance', () => {
  RerankCacheInstance.set('junk', { matches: [] });
  assert.equal(RerankCacheInstance.size(), 1);
  clearRerankCache();
  assert.equal(RerankCacheInstance.size(), 0);
});
