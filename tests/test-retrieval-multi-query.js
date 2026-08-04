'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  deterministicVariants,
  uniqueQueries,
  TEMPLATES,
} = require('../tools/retrieval-multi-query');

test('TEMPLATES produce multiple variants', () => {
  assert.ok(TEMPLATES.length >= 4);
  const v = deterministicVariants('session not found', 5);
  assert.ok(v.length >= 3);
  assert.ok(v.some((q) => q.includes('session not found')));
  // synonym rewrite should expand known failure class
  assert.ok(v.some((q) => /mobile_|isRecoverableSessionId/.test(q)));
});

test('uniqueQueries dedupes case/whitespace', () => {
  const u = uniqueQueries(['Foo Bar', 'foo   bar', 'baz']);
  assert.equal(u.length, 2);
});

test('deterministicVariants is stable', () => {
  const a = deterministicVariants('tailscale unreachable', 5);
  const b = deterministicVariants('tailscale unreachable', 5);
  assert.deepEqual(a, b);
});
