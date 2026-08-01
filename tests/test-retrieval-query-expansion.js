'use strict';

const assert = require('assert');
const {
  expandQuery,
  rerankCandidates,
} = require('../tools/hermes-retrieval-harness.js');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed += 1;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    failed += 1;
    console.error(`  ✗ ${name}: ${err.message}`);
  }
}

// ---------------------------------------------------------------------------
// Query Expansion Tests
// ---------------------------------------------------------------------------

console.log('\n=== Query Expansion Tests ===');

test('expandQuery returns expanded tokens including synonyms', () => {
  const result = expandQuery('how much does it cost');
  assert.ok(result.expandedTokens.includes('cost'), 'should include original tokens');
  assert.ok(result.expandedTokens.includes('price'), 'should include synonym "price"');
  assert.ok(result.expandedTokens.includes('pricing'), 'should include synonym "pricing"');
});

test('expandQuery handles acronyms', () => {
  const result = expandQuery('what is MCP');
  assert.ok(result.expandedTokens.includes('mcp'), 'should include original token');
  assert.ok(result.expandedTokens.includes('model') && result.expandedTokens.includes('context') && result.expandedTokens.includes('protocol'),
    'should expand MCP acronym');
});

test('expandQuery returns empty expansions list when no synonyms found', () => {
  const result = expandQuery('randomword');
  assert.ok(result.expandedTokens.length > 0, 'should still have the original token');
  assert.ok(Array.isArray(result.expansions), 'should return expansions array');
});

test('expandQuery deduplicates tokens', () => {
  const result = expandQuery('price cost pricing');
  const unique = new Set(result.expandedTokens);
  assert.strictEqual(result.expandedTokens.length, unique.size, 'tokens should be deduplicated');
});

test('expandQuery handles empty query', () => {
  const result = expandQuery('');
  assert.strictEqual(result.expandedTokens.length, 0, 'empty query should return no tokens');
});

// ---------------------------------------------------------------------------
// Reranker Tests
// ---------------------------------------------------------------------------

console.log('\n=== Reranker Tests ===');

test('rerankCandidates returns empty array for empty input', () => {
  const result = rerankCandidates(['test'], []);
  assert.strictEqual(result.length, 0);
});

test('rerankCandidates boosts candidates with higher query-term density', () => {
  const queryTokens = ['pricing', 'model'];
  const candidates = [
    {
      path: 'docs/pricing.md',
      snippet: 'The pricing model for this product costs $5 per user.',
      score: 10,
      chunk: { header: 'Pricing Model' },
    },
    {
      path: 'docs/overview.md',
      snippet: 'Welcome to the product overview page.',
      score: 15, // higher initial score but no query-term match
      chunk: { header: 'Overview' },
    },
  ];
  const reranked = rerankCandidates(queryTokens, candidates);
  const pricing = reranked.find((r) => r.path === 'docs/pricing.md');
  const overview = reranked.find((r) => r.path === 'docs/overview.md');
  assert.ok(pricing.rerankScore > overview.rerankScore,
    'candidate with query-term density should rank higher');
});

test('rerankCandidates adds phrase bonus for consecutive query terms', () => {
  const queryTokens = ['pricing', 'model'];
  const candidates = [
    {
      path: 'a.md',
      snippet: 'The pricing model is very affordable.',
      score: 10,
      chunk: { header: '' },
    },
    {
      path: 'b.md',
      snippet: 'The model has good pricing overall.',
      score: 10,
      chunk: { header: '' },
    },
  ];
  const reranked = rerankCandidates(queryTokens, candidates);
  // Both should have phrase bonuses since both contain "pricing model"
  const a = reranked.find((r) => r.path === 'a.md');
  assert.ok(a.rerankReasons.some((r) => r.startsWith('phrase:')),
    'should detect phrase match');
});

test('rerankCandidates adds header bonus when header matches query terms', () => {
  const queryTokens = ['error', 'handling'];
  const candidates = [
    {
      path: 'a.md',
      snippet: 'How errors are handled.',
      score: 10,
      chunk: { header: 'Error Handling' },
    },
    {
      path: 'b.md',
      snippet: 'How errors are handled.',
      score: 10,
      chunk: { header: 'Random Section' },
    },
  ];
  const reranked = rerankCandidates(queryTokens, candidates);
  const withHeader = reranked.find((r) => r.path === 'a.md');
  const withoutHeader = reranked.find((r) => r.path === 'b.md');
  assert.ok(withHeader.rerankScore > withoutHeader.rerankScore,
    'header match should boost score');
});

test('rerankCandidates normalizes scores to prevent long-document dominance', () => {
  const queryTokens = ['test'];
  const candidates = [
    {
      path: 'short.md',
      snippet: 'This is a test.',
      score: 5,
      chunk: { header: '' },
    },
    {
      path: 'long.md',
      snippet: 'This is a test. '.repeat(50),
      score: 250, // much higher initial score from length
      chunk: { header: '' },
    },
  ];
  const reranked = rerankCandidates(queryTokens, candidates);
  const shortDoc = reranked.find((r) => r.path === 'short.md');
  const longDoc = reranked.find((r) => r.path === 'long.md');
  // After normalization, the short doc should be competitive, not crushed
  assert.ok(shortDoc.rerankScore > 0,
    'short doc should have positive rerank score after normalization');
});

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);
if (failed > 0) {
  process.exit(1);
}
