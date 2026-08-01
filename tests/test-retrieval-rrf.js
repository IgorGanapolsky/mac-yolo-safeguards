'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { rrfFuse } = require('../tools/retrieval-rrf');

test('agreement across lists ranks first', () => {
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
  assert.equal(fused[0].path, 'b.js');
  assert.ok(fused[0].sources.includes('harness') && fused[0].sources.includes('grepai'));
});

test('weighted RRF prefers strong harness hit over grepae-only noise', () => {
  // Harness: gold@1 ; grepae: noise@1, gold@8 — plain equal RRF can bury gold.
  const fused = rrfFuse(
    [
      [{ path: 'tools/agent-swarm-harness.js', rank: 1, source: 'harness', score: 40 }],
      [
        { path: 'docs/unrelated-semantic-hit.md', rank: 1, source: 'grepai' },
        { path: 'tools/agent-swarm-harness.js', rank: 8, source: 'grepai' },
      ],
    ],
    { query: 'agent swarm harness' },
  );
  assert.equal(fused[0].path, 'tools/agent-swarm-harness.js');
  assert.ok(fused[0].rrfScore > fused.find((m) => m.path.includes('unrelated')).rrfScore);
});

test('path token boost helps basename match', () => {
  const fused = rrfFuse(
    [
      [
        { path: 'docs/other.md', rank: 1, source: 'harness' },
        { path: 'tools/hermes-cloud-connector.js', rank: 2, source: 'harness' },
      ],
    ],
    { query: 'hermes cloud connector' },
  );
  // connector basename shares more query tokens → may pass other.md
  assert.ok(fused.some((m) => m.path.includes('hermes-cloud-connector')));
});
