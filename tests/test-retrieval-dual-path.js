'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { rrfFuse, pathAllowed } = require('../tools/retrieval-dual-path');

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
