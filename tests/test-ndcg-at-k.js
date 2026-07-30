#!/usr/bin/env node
'use strict';

// Coverage for ndcgAtK — the repo's headline retrieval-ranking metric.
//
// WHAT WAS WRONG
//   IDCG was derived from the number of relevant documents FOUND rather than
//   the number that EXIST:
//
//       const idealCount = Math.min(k, pathRel.reduce((s, r) => s + r, 0)
//                                     || relevantSubstrings.length);
//
//   With 3 relevant documents, retrieving only 1 and ranking it first scored
//   nDCG = 1.0 — exactly the same as retrieving all 3 in perfect order. The
//   metric could not distinguish good ranking from bad recall, which is the one
//   thing it exists to measure, and every reported nDCG was inflated whenever
//   recall was below 1.
//
//   Because tools/rag-retrieval-eval.js reports mean nDCG as a quality figure
//   (and docs/SYSTEM-MATURITY.md cites it), this silently overstated retrieval
//   quality across the whole repo.
//
// WHY THESE TESTS LOOK LIKE THIS
//   Every expected value below is computed by hand from the definition
//   DCG = sum(rel_i / log2(i+2)), IDCG = same over the ideal ranking — rather
//   than snapshotted from the implementation. A test that records whatever the
//   code currently returns cannot detect that the code is wrong.

const assert = require('assert');
const path = require('path');
const { ndcgAtK } = require(path.join(__dirname, '..', 'tools', 'ml-core.js'));

let pass = 0;
let fail = 0;
function test(name, fn) {
  try { fn(); console.log(`PASS ${name}`); pass += 1; } catch (e) {
    console.error(`FAIL ${name}\n  ${e.message}`); fail += 1; process.exitCode = 1;
  }
}
const near = (a, b, eps = 1e-3) => Math.abs(a - b) < eps;

// Hand-computed constants from the definition.
const D1 = 1 / Math.log2(2);            // 1.0000  position 1
const D2 = 1 / Math.log2(3);            // 0.6309  position 2
const D3 = 1 / Math.log2(4);            // 0.5000  position 3
const IDCG3 = D1 + D2 + D3;             // 2.1309  ideal over 3 relevant docs

// --- THE BUG ------------------------------------------------------------------
test('finding 1 of 3 relevant docs does NOT score a perfect 1.0', () => {
  const got = ndcgAtK(['A.js', 'X.js', 'Y.js'], ['A.js', 'B.js', 'C.js'], 3);
  assert.ok(near(got, D1 / IDCG3), `expected ${(D1 / IDCG3).toFixed(4)}, got ${got}`);
  assert.ok(got < 0.5, 'missing two thirds of the relevant set cannot be near-perfect');
});

test('partial recall scores strictly below full recall', () => {
  const partial = ndcgAtK(['A.js', 'X.js', 'Y.js'], ['A.js', 'B.js', 'C.js'], 3);
  const full = ndcgAtK(['A.js', 'B.js', 'C.js'], ['A.js', 'B.js', 'C.js'], 3);
  assert.equal(full, 1, 'perfect retrieval must be 1.0');
  assert.ok(partial < full, `partial (${partial}) must rank below full (${full})`);
});

test('finding 2 of 3 lands between finding 1 and finding 3', () => {
  const one = ndcgAtK(['A.js', 'X.js', 'Y.js'], ['A.js', 'B.js', 'C.js'], 3);
  const two = ndcgAtK(['A.js', 'B.js', 'Y.js'], ['A.js', 'B.js', 'C.js'], 3);
  const three = ndcgAtK(['A.js', 'B.js', 'C.js'], ['A.js', 'B.js', 'C.js'], 3);
  assert.ok(one < two && two < three, `expected monotonic, got ${one} < ${two} < ${three}`);
  assert.ok(near(two, (D1 + D2) / IDCG3), `expected ${((D1 + D2) / IDCG3).toFixed(4)}, got ${two}`);
});

// --- ranking sensitivity ------------------------------------------------------
test('rank position matters: the same hit scores lower further down', () => {
  const first = ndcgAtK(['A.js', 'X.js', 'Y.js'], ['A.js'], 3);
  const third = ndcgAtK(['X.js', 'Y.js', 'A.js'], ['A.js'], 3);
  assert.equal(first, 1, 'the only relevant doc at rank 1 is a perfect ranking');
  assert.ok(near(third, D3 / D1), `expected ${(D3 / D1).toFixed(4)}, got ${third}`);
  assert.ok(third < first);
});

// --- double-counting ----------------------------------------------------------
test('several paths matching ONE expectation are credited once', () => {
  // Both files contain "foo"; only one relevant document was declared.
  const got = ndcgAtK(['foo.ts', 'foo.test.ts', 'z.ts'], ['foo'], 3);
  assert.equal(got, 1, 'one expectation satisfied at rank 1 is a perfect ranking');
  assert.ok(got <= 1, 'must never exceed 1');
});

test('double-matching cannot mask a genuinely missed document', () => {
  // "foo" matches twice, "bar" is never retrieved. Credit must be 1 of 2.
  const got = ndcgAtK(['foo.ts', 'foo.test.ts'], ['foo', 'bar'], 2);
  const expected = D1 / (D1 + D2);
  assert.ok(near(got, expected), `expected ${expected.toFixed(4)}, got ${got}`);
  assert.ok(got < 1, 'a missed relevant document must keep the score under 1');
});

// --- degenerate inputs --------------------------------------------------------
test('no relevant documents retrieved scores 0', () => {
  assert.equal(ndcgAtK(['X.js', 'Y.js'], ['A.js'], 2), 0);
});

test('an empty expectation set scores 0, not a free 1.0', () => {
  // A case declaring nothing relevant must not be rewarded — that would let a
  // fixture raise the mean simply by expecting nothing.
  //
  // HONESTY NOTE: mutation testing showed this assertion is NOT independently
  // observable. Reverting the guard to `pathRel.some(Boolean) ? 1 : 0` leaves
  // this test green, because idcg is 0 only when relevantSubstrings is empty,
  // and in that case no path can be credited, so `some(Boolean)` is already
  // false. The simplification is defensive, not behavioural. The test stays
  // because the invariant is worth stating, but it is recorded here as not
  // proving anything on its own.
  assert.equal(ndcgAtK(['A.js', 'B.js'], [], 2), 0);
});

test('an empty result list scores 0', () => {
  assert.equal(ndcgAtK([], ['A.js'], 5), 0);
});

test('k truncates the ranking that is scored', () => {
  // The only relevant doc sits at rank 3, outside k=2.
  assert.equal(ndcgAtK(['X.js', 'Y.js', 'A.js'], ['A.js'], 2), 0);
});

test('k larger than the result list does not inflate the score', () => {
  const got = ndcgAtK(['A.js'], ['A.js', 'B.js'], 10);
  // Two relevant docs exist, one retrieved at rank 1.
  const expected = D1 / (D1 + D2);
  assert.ok(near(got, expected), `expected ${expected.toFixed(4)}, got ${got}`);
});

test('windows-style separators still match', () => {
  assert.equal(ndcgAtK(['tools\\ml-core.js'], ['tools/ml-core.js'], 1), 1);
});

test('the result is always within [0, 1]', () => {
  const cases = [
    [['A.js', 'A.js', 'A.js'], ['A.js'], 3],
    [['A.js', 'B.js'], ['A.js', 'B.js', 'C.js', 'D.js'], 2],
    [['A.js'], ['A'], 1],
  ];
  for (const [r, rel, k] of cases) {
    const got = ndcgAtK(r, rel, k);
    assert.ok(got >= 0 && got <= 1, `out of range: ${got} for ${JSON.stringify(r)}`);
  }
});

console.log(`\n=== ndcgAtK: ${pass} passed, ${fail} failed ===`);
