'use strict';

/**
 * Unit tests for tools/hermes-retrieval-hybrid.js.
 *
 * Covers: query rewriting, metadata scoring, RRF combination, weighted hybrid
 * combination, grepai deduplication, and grepai availability detection.
 *
 * Run: node tests/test-hermes-retrieval-hybrid.js
 */

const assert = require('assert');

const {
  retrieve,
  rewriteQuery,
  rrfCombine,
  hybridCombine,
  metadataMultiplier,
  dedupeByPath,
  applyMetadataAndSort,
  RRF_K,
  PINNED_EMBEDDING_MODEL,
  SYNONYM_MAP,
  parseArgs,
} = require('../tools/hermes-retrieval-hybrid');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed += 1;
    console.log(`  ✔ ${name}`);
  } catch (error) {
    failed += 1;
    console.error(`  ✗ ${name}`);
    console.error(`    ${error.message}`);
  }
}

function assertContains(arr, item, msg) {
  assert(
    arr.some((v) => v.includes(item)),
    msg || `expected array to contain "${item}"`,
  );
}

// ─── Query Rewriting ───────────────────────────────────────────────

console.log('\n── Query Rewriting ──');

test('rewriteQuery expands camelCase tokens', () => {
  const expanded = rewriteQuery('ChatScreen gatewayDiscovery');
  // "ChatScreen" → "chat" + "screen"
  // "gatewayDiscovery" → "gateway" + "discovery"
  assert(expanded.includes('chat'));
  assert(expanded.includes('screen'));
  assert(expanded.includes('gateway'));
  assert(expanded.includes('discovery'));
});

test('rewriteQuery injects synonyms', () => {
  const expanded = rewriteQuery('leash usb');
  // "leash" → "hermes-hardware-leash", "usb-watchdog", "kill-switch", "reverse-tether"
  assertContains(expanded.split(' '), 'hermes-hardware-leash', 'should include leash synonym');
  assertContains(expanded.split(' '), 'usb-watchdog', 'should include usb-watchdog synonym');
  assertContains(expanded.split(' '), 'kill-switch', 'should include kill-switch synonym');
  assertContains(expanded.split(' '), 'reverse-tether', 'should include reverse-tether synonym');
});

test('rewriteQuery does NOT split LinkedIn into "linked" + "in"', () => {
  // "LinkedIn" is camelCase: L-i-n-k-e-d-I-n → [Linked, In] → [linked, in]
  // But "in" is only 2 chars, so with min-length 3 it should be filtered out
  const expanded = rewriteQuery('LinkedIn');
  const tokens = expanded.split(' ');
  assertContains(tokens, 'linkedin', 'should keep full "linkedin" token');
  // "linked" from the camelCase split should also appear (it's >= 3 chars)
  assertContains(tokens, 'linked', 'camelCase split of LinkedIn should include "linked"');
  // "in" should NOT appear (filtered by min-length 3)
  assert(
    !tokens.includes('in'),
    'should NOT include the 2-char fragment "in" from camelCase split',
  );
});

test('rewriteQuery is idempotent (calling twice gives same result)', () => {
  const first = rewriteQuery('gateway pair chrome');
  const second = rewriteQuery(first);
  assert.strictEqual(first, second, 'rewrite should be idempotent');
});

test('rewriteQuery preserves original tokens', () => {
  const expanded = rewriteQuery('hardware leash');
  assertContains(expanded.split(' '), 'hardware', 'should keep original "hardware"');
  assertContains(expanded.split(' '), 'leash', 'should keep original "leash"');
});

test('rewriteQuery filters stop words and short tokens', () => {
  const expanded = rewriteQuery('the on a of for with to in');
  // All of these are either stopwords or too short
  // After filtering, should still contain the synonym expansions
  // but no standalone "in", "on", "of", "to" etc
  const tokens = expanded.split(' ');
  assert(!tokens.includes('in'), 'should filter "in"');
  assert(!tokens.includes('on'), 'should filter "on"');
  assert(!tokens.includes('of'), 'should filter "of"');
});

test('SYNONYM_MAP has expected entries', () => {
  assert.ok(SYNONYM_MAP['leash'], 'should have leash synonyms');
  assert.ok(SYNONYM_MAP['gateway'], 'should have gateway synonyms');
  assert.ok(SYNONYM_MAP['chrome'], 'should have chrome synonyms');
  assert.ok(SYNONYM_MAP['claim'], 'should have claim synonyms');
  assert.ok(Array.isArray(SYNONYM_MAP['leash']), 'synonyms should be arrays');
});

// ─── Metadata Multiplier ───────────────────────────────────────────

console.log('\n── Metadata Multiplier ──');

test('metadataMultiplier boosts API routes', () => {
  const m = metadataMultiplier('apps/hermes-control-plane/app/api/billing/portal/route.ts');
  assert(m > 1.2, `API route multiplier should be > 1.2, got ${m}`);
});

test('metadataMultiplier boosts production source', () => {
  const m = metadataMultiplier('hermes-mobile/src/services/gatewayDiscovery.ts');
  assert(m >= 1.15, `Source file multiplier should be >= 1.15, got ${m}`);
});

test('metadataMultiplier penalizes test files', () => {
  const m1 = metadataMultiplier('tests/test-hermes-retrieval-hybrid.js');
  const m2 = metadataMultiplier('hermes-mobile/src/__tests__/ChatScreen.test.tsx');
  assert(m1 <= 0.5, `test file multiplier should be <= 0.5, got ${m1}`);
  assert(m2 <= 0.5, `test file multiplier should be <= 0.5, got ${m2}`);
});

test('metadataMultiplier boosts tools', () => {
  const m = metadataMultiplier('tools/hermes-retrieval-hybrid.js');
  assert(m >= 1.0, `tool file multiplier should be >= 1.0, got ${m}`);
});

test('metadataMultiplier boosts docs', () => {
  const m = metadataMultiplier('docs/agents/coordination.md');
  assert(m >= 1.0, `docs multiplier should be >= 1.0, got ${m}`);
});

test('metadataMultiplier penalizes config files', () => {
  const m1 = metadataMultiplier('package.json');
  const m2 = metadataMultiplier('tsconfig.json');
  const m3 = metadataMultiplier('jest.config.js');
  const m4 = metadataMultiplier('.prettierrc.js');
  assert(m1 <= 0.9, `package.json multiplier should be <= 0.9, got ${m1}`);
  assert(m2 <= 0.9, `tsconfig.json multiplier should be <= 0.9, got ${m2}`);
  assert(m3 <= 0.9, `jest.config.js multiplier should be <= 0.9, got ${m3}`);
  assert(m4 <= 0.9, `.prettierrc.js multiplier should be <= 0.9, got ${m4}`);
});

test('metadataMultiplier penalizes generated files', () => {
  const m = metadataMultiplier('src/generated/types.ts');
  assert(m <= 0.6, `generated file multiplier should be <= 0.6, got ${m}`);
});

test('metadataMultiplier handles edge cases', () => {
  assert.strictEqual(metadataMultiplier(''), 1.0, 'empty path → 1.0');
  assert.strictEqual(metadataMultiplier(undefined), 1.0, 'undefined → 1.0');
  assert.strictEqual(metadataMultiplier(null), 1.0, 'null → 1.0');
});

// ─── RRF Combination ───────────────────────────────────────────────

console.log('\n── RRF Combination ──');

test('rrfCombine scores files in both lists higher', () => {
  const kw = [
    { path: 'a.ts', score: 100, reasons: ['path:a'], snippet: 'snip a' },
    { path: 'b.ts', score: 80, reasons: ['path:b'], snippet: 'snip b' },
    { path: 'c.ts', score: 60, reasons: ['path:c'], snippet: 'snip c' },
  ];
  const emb = [
    { path: 'b.ts', score: 0.02, embeddingScore: 0.02, snippet: 'snip b2' },
    { path: 'c.ts', score: 0.015, embeddingScore: 0.015, snippet: 'snip c2' },
    { path: 'd.ts', score: 0.01, embeddingScore: 0.01, snippet: 'snip d' },
  ];
  const result = rrfCombine(kw, emb);
  // 'b.ts' appears in both lists and should rank high
  assert(result[0].path === 'b.ts' || result[1].path === 'b.ts', 'b.ts should be in top 2 (in both lists)');
  // 'd.ts' only in embedding, lowest keyword score
  const dEntry = result.find((e) => e.path === 'd.ts');
  const aEntry = result.find((e) => e.path === 'a.ts');
  assert(dEntry, 'd.ts should be in results');
  assert(aEntry, 'a.ts should be in results');
});

test('rrfCombine dedupes sources field', () => {
  const kw = [{ path: 'a.ts', score: 10, reasons: [], snippet: '' }];
  const emb = [{ path: 'a.ts', score: 0.02, embeddingScore: 0.02, snippet: '' }];
  const result = rrfCombine(kw, emb);
  assert.deepStrictEqual(result[0].sources, ['keyword', 'embedding'], 'sources should be deduped');
});

test('rrfCombine applies metadata multiplier to final score', () => {
  const kw = [{ path: 'a.ts', score: 10, reasons: [], snippet: '' }];
  const emb = [];
  const result = rrfCombine(kw, emb);
  assert(result[0].metadataMultiplier > 0, 'should have metadata multiplier');
  assert(result[0].finalScore >= (result[0].rrfRaw || 0), 'finalScore should be >= rrfRaw when multiplier >= 1');
});

test('hybridCombine preserves keyword score as primary signal', () => {
  const kw = [
    { path: 'a.ts', score: 100, reasons: [], snippet: '' },
    { path: 'b.ts', score: 50, reasons: [], snippet: '' },
  ];
  const emb = [
    { path: 'a.ts', score: 0.05, embeddingScore: 0.05, snippet: '' },
    { path: 'c.ts', score: 0.025, embeddingScore: 0.025, snippet: '' },
  ];
  const result = hybridCombine(kw, emb, 0.6, 0.4);
  // 'a.ts' has both keyword and embedding — should rank first
  assert.strictEqual(result[0].path, 'a.ts', 'a.ts should rank first (in both lists)');
  // 'b.ts' has keyword only — should rank above embedding-only 'c.ts'
  const bIdx = result.findIndex((e) => e.path === 'b.ts');
  const cIdx = result.findIndex((e) => e.path === 'c.ts');
  assert(bIdx < cIdx, 'keyword-only b.ts should rank above embedding-only c.ts');
  // 'b.ts' hybrid score should be >= its keyword score (embedding bonus for a.ts shouldn't push b below c)
  const bEntry = result.find((e) => e.path === 'b.ts');
  assert(bEntry.hybridRaw > 0, 'b.ts should have a positive hybrid score');
});

test('hybridCombine applies metadata multiplier', () => {
  const kw = [{ path: 'src/app.ts', score: 100, reasons: [], snippet: '' }];
  const emb = [];
  const result = hybridCombine(kw, emb, 0.6, 0.4);
  assert(result[0].metadataMultiplier >= 1.0, 'source file should have mult >= 1.0');
});

// ─── Dedup by Path ─────────────────────────────────────────────────

console.log('\n── Dedup by Path ──');

test('dedupeByPath keeps highest-scoring duplicate', () => {
  const matches = [
    { path: 'a.ts', score: 0.02, embeddingScore: 0.02, snippet: 'first' },
    { path: 'b.ts', score: 0.03, embeddingScore: 0.03, snippet: 'second' },
    { path: 'a.ts', score: 0.01, embeddingScore: 0.01, snippet: 'third (lower)' },
  ];
  const result = dedupeByPath(matches);
  assert.strictEqual(result.length, 2, 'should dedupe to 2 unique paths');
  const aEntry = result.find((m) => m.path === 'a.ts');
  assert.strictEqual(aEntry.embeddingScore, 0.02, 'should keep highest score for a.ts');
});

test('dedupeByPath handles empty array', () => {
  assert.deepStrictEqual(dedupeByPath([]), []);
});

test('dedupeByPath handles single entry', () => {
  const input = [{ path: 'a.ts', score: 0.05, embeddingScore: 0.05, snippet: 'x' }];
  const result = dedupeByPath(input);
  assert.strictEqual(result.length, 1);
  assert.strictEqual(result[0].path, 'a.ts');
});

// ─── applyMetadataAndSort ──────────────────────────────────────────

console.log('\n── applyMetadataAndSort ──');

test('applyMetadataAndSort sorts by score descending', () => {
  const entries = [
    { path: 'a.ts', score: 10, sources: ['keyword'], reasons: [], snippet: '', bytes: 0, rrfScore: 10 },
    { path: 'b.ts', score: 50, sources: ['keyword'], reasons: [], snippet: '', bytes: 0, rrfScore: 50 },
    { path: 'c.ts', score: 30, sources: ['keyword'], reasons: [], snippet: '', bytes: 0, rrfScore: 30 },
  ];
  const result = applyMetadataAndSort(entries, (e) => e.rrfScore);
  assert(result[0].finalScore >= result[1].finalScore, 'should be sorted descending');
  assert(result[1].finalScore >= result[2].finalScore, 'should be sorted descending');
});

test('applyMetadataAndSort dedupes sources and reasons', () => {
  const entries = [
    {
      path: 'a.ts',
      sources: ['keyword', 'embedding', 'embedding'],
      reasons: ['path:a', 'rerank:embedding-match', 'rerank:embedding-match'],
      snippet: '',
      bytes: 0,
      rrfScore: 1,
      score: 1,
    },
  ];
  const result = applyMetadataAndSort(entries, (e) => e.rrfScore);
  assert.deepStrictEqual(result[0].sources, ['keyword', 'embedding']);
  assert.deepStrictEqual(result[0].reasons, ['path:a', 'rerank:embedding-match']);
});

test('applyMetadataAndSort breaks ties by path lexically', () => {
  const entries = [
    { path: 'z.ts', sources: [], reasons: [], snippet: '', bytes: 0, rrfScore: 1, score: 1 },
    { path: 'a.ts', sources: [], reasons: [], snippet: '', bytes: 0, rrfScore: 1, score: 1 },
  ];
  const result = applyMetadataAndSort(entries, (e) => e.rrfScore);
  // Same score → path sort: a.ts before z.ts
  assert.strictEqual(result[0].path, 'a.ts');
  assert.strictEqual(result[1].path, 'z.ts');
});

// ─── Constants ───────────────────────────────────────────────────────

console.log('\n── Constants ──');

test('RRF_K is 60', () => {
  assert.strictEqual(RRF_K, 60);
});

test('PINNED_EMBEDDING_MODEL is a valid model name', () => {
  assert.ok(PINNED_EMBEDDING_MODEL, 'model name should be non-empty');
  assert(PINNED_EMBEDDING_MODEL.includes('nomic'), 'should be a nomic model');
});

// ─── Parse Args ────────────────────────────────────────────────────

console.log('\n── Parse Args ──');

test('parseArgs retrieve with --query', () => {
  const args = parseArgs(['retrieve', '--query', 'hello world', '--limit', '5']);
  assert.strictEqual(args.command, 'retrieve');
  assert.strictEqual(args.query, 'hello world');
  assert.strictEqual(args.limit, 5);
});

test('parseArgs retrieve with default query', () => {
  const args = parseArgs(['retrieve', 'hello world']);
  assert.strictEqual(args.query, 'hello world');
  assert.strictEqual(args.command, 'retrieve');
});

test('parseArgs retrieve with --mode rrf', () => {
  const args = parseArgs(['retrieve', '--query', 'test', '--mode', 'rrf']);
  assert.strictEqual(args.mode, 'rrf');
});

test('parseArgs retrieve with --skip-embedding', () => {
  const args = parseArgs(['retrieve', '--query', 'test', '--skip-embedding']);
  assert.strictEqual(args.skipEmbedding, true);
});

test('parseArgs score command collects positional args', () => {
  const args = parseArgs(['score', 'dummy', 'tools/test.js', '--json']);
  assert.strictEqual(args.command, 'score');
  assert.deepStrictEqual(args.positional, ['dummy', 'tools/test.js']);
  assert.strictEqual(args.json, true);
});

test('parseArgs throws on unknown argument', () => {
  assert.throws(() => parseArgs(['retrieve', '--query', 'test', '--bogus']), /Unknown argument/);
});

// ─── Integration: retrieve with skipEmbedding (no external deps) ────

console.log('\n── Integration (keyword-only mode) ──');

test('retrieve with skipEmbedding returns keyword results', () => {
  const result = retrieve('hardware leash USB watchdog', {
    skipEmbedding: true,
    limit: 5,
    maxFiles: 2000,
  });
  assert.ok(result.matches.length > 0, 'should return matches');
  assert.strictEqual(result.mode, 'hybrid');
  assert.strictEqual(result.backends.keyword.provider, 'hermes-retrieval-harness');
  assert.strictEqual(result.backends.embedding.available, false);
  // First result should be related to hardware leash (tool or doc both acceptable)
  const topPath = result.matches[0].path.toLowerCase();
  assert(
    topPath.includes('leash'),
    'top result should be hardware-leash related, got: ' + result.matches[0].path,
  );
});

test('retrieve rewrites query before keyword search', () => {
  const result = retrieve('leash USB', { skipEmbedding: true, limit: 3, maxFiles: 2000 });
  assert.ok(result.rewritten, 'query should be rewritten when synonyms are injected');
  assert(result.rewrittenQuery !== undefined, 'rewrittenQuery should be set');
  assert(
    result.rewrittenQuery.includes('usb-watchdog'),
    'should contain synonym expansion, got: ' + result.rewrittenQuery,
  );
});

test('retrieve applies metadata multiplier to final score', () => {
  const result = retrieve('hardware leash', { skipEmbedding: true, limit: 5, maxFiles: 2000 });
  // At least one result should have a non-1.0 multiplier
  const hasAdjusted = result.matches.some((m) => m.metadataMultiplier !== 1.0);
  assert(hasAdjusted, 'at least one match should have a metadata multiplier != 1.0');
});

test('retrieve handles empty query gracefully', () => {
  assert.throws(() => retrieve('', { skipEmbedding: true }), /requires a non-empty query/);
});

// ─── Summary ────────────────────────────────────────────────────────

console.log('\n── Summary ──');
console.log(`\n  ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
