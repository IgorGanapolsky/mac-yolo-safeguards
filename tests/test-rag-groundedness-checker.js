'use strict';

const assert = require('assert');
const {
  checkGroundedness,
  checkSentence,
  splitSentences,
  isClaimSentence,
  extractProperNouns,
  extractNumbers,
  tokenOverlap,
} = require('../tools/rag-groundedness-checker.js');

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

console.log('\n=== Groundedness Checker Tests ===');

test('splitSentences splits on period + capital', () => {
  const sentences = splitSentences('The price is $5. Users can upgrade.');
  assert.ok(sentences.length >= 2, 'should split into at least 2 sentences');
});

test('splitSentences filters very short fragments', () => {
  const sentences = splitSentences('Hi. Ok. This is a longer sentence that should remain.');
  assert.ok(sentences.every((s) => s.length > 10), 'should filter out short fragments');
});

test('isClaimSentence identifies factual assertions', () => {
  assert.ok(isClaimSentence('The system costs $50 per month.'));
  assert.ok(isClaimSentence('The model supports streaming.'));
  assert.ok(!isClaimSentence('Here is the answer to your question.'));
  assert.ok(!isClaimSentence('[1] Source: docs/pricing.md'));
});

test('extractProperNouns finds capitalized mid-sentence words', () => {
  const pn = extractProperNouns('The Stripe integration requires an API key.');
  assert.ok(pn.has('stripe'), 'should extract "Stripe"');
  assert.ok(pn.has('api'), 'should extract "API"');
});

test('extractNumbers finds prices and metrics', () => {
  const nums = extractNumbers('The cost is $1,500 and uptime is 99.9%');
  assert.ok([...nums].some((n) => n.includes('1,500')), 'should extract price');
  assert.ok([...nums].some((n) => n.includes('99.9')), 'should extract percentage');
});

test('tokenOverlap computes fraction of shared tokens', () => {
  const overlap = tokenOverlap('the system costs money', 'the system charges a fee');
  assert.ok(overlap > 0.3, 'should have decent overlap');
  assert.ok(overlap <= 1.0, 'overlap should be <= 1');
});

// ---------------------------------------------------------------------------
// Full groundedness check
// ---------------------------------------------------------------------------

console.log('\n=== Full Groundedness Check Tests ===');

test('checkGroundedness passes when answer is fully supported by context', () => {
  const context = [
    'ThumbGate is an AI guardrails product. It costs $499 per month for the diagnostic tier. The system supports cloud and local routing.',
  ];
  const answer = 'ThumbGate costs $499 per month. The system supports cloud and local routing.';
  const result = checkGroundedness(answer, context);
  assert.strictEqual(result.grounded, true, 'fully supported answer should be grounded');
  assert.strictEqual(result.score, 1.0, 'all claims should be supported');
});

test('checkGroundedness flags fabricated numbers not in context', () => {
  const context = [
    'ThumbGate costs $499 per month for the diagnostic tier.',
  ];
  const answer = 'ThumbGate costs $999 per month for all users.';
  const result = checkGroundedness(answer, context);
  assert.strictEqual(result.grounded, false, 'fabricated price should be flagged');
  assert.ok(result.unsupportedSentences.length > 0, 'should have unsupported sentences');
  assert.ok(result.reasons.some((r) => r.includes('unmatched_numbers')),
    'should flag unmatched numbers');
});

test('checkGroundedness flags fabricated proper nouns', () => {
  const context = [
    'ThumbGate integrates with Claude and GPT models.',
  ];
  const answer = 'ThumbGate integrates with Claude and GPT models. Llama integration was added in version 3.5.';
  const result = checkGroundedness(answer, context);
  // The second sentence introduces "Llama" and "3.5" not in context
  assert.strictEqual(result.grounded, false, 'fabricated noun should be flagged');
});

test('checkGroundedness handles empty answer gracefully', () => {
  const result = checkGroundedness('', ['some context']);
  assert.strictEqual(result.totalClaims, 0, 'empty answer has no claims');
  assert.strictEqual(result.grounded, true, 'empty answer is trivially grounded');
});

test('checkGroundedness handles no context gracefully', () => {
  const result = checkGroundedness('The system costs $5.', []);
  assert.strictEqual(result.grounded, false, 'claims with no context should be flagged');
});

test('checkGroundedness returns detailed per-sentence results', () => {
  const context = [
    'The API supports streaming responses. Authentication uses OAuth 2.0.',
  ];
  const answer = 'The API supports streaming responses. Authentication uses OAuth 2.0.';
  const result = checkGroundedness(answer, context);
  assert.ok(Array.isArray(result.allCheckedSentences), 'should return per-sentence array');
  assert.ok(result.allCheckedSentences.length > 0, 'should have at least one checked sentence');
  assert.ok(result.allCheckedSentences[0].hasOwnProperty('overlap'),
    'each sentence should have overlap score');
});

console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);
if (failed > 0) {
  process.exit(1);
}
