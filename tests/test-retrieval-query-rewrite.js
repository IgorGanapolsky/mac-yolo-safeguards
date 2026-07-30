'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { rewriteQuery, SYNONYM_RULES } = require('../tools/retrieval-query-rewrite');

test('rewrite is deterministic and expands session-not-found', () => {
  const a = rewriteQuery('Session not found on web continue');
  const b = rewriteQuery('Session not found on web continue');
  assert.deepEqual(a, b);
  assert.ok(a.rulesFired.includes('session-not-found'));
  assert.ok(a.rewritten.includes('mobile_'));
  assert.ok(a.rewritten.includes('isRecoverableSessionId'));
});

test('rewrite is no-op when no rule matches', () => {
  const r = rewriteQuery('how do I change the button color');
  assert.equal(r.rewritten, r.original);
  assert.equal(r.expansions.length, 0);
});

test('synonym rule table is non-empty', () => {
  assert.ok(SYNONYM_RULES.length >= 4);
});
