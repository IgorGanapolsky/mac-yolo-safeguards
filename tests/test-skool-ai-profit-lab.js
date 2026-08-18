'use strict';

const assert = require('assert');
const path = require('path');
const fs = require('fs');
const { SkoolAIProfitLabEngine, MONETIZATION_OFFERS } = require('../tools/skool-ai-profit-lab-engine.js');

console.log('=== Running Skool AI Profit Lab Engine Tests ===');

const tmpLedger = path.join(__dirname, '../docs/vault/Projects/Skool-AI-Profit-Lab/test_ledger.json');
try {
  if (fs.existsSync(tmpLedger)) fs.unlinkSync(tmpLedger);
} catch (e) {}

const engine = new SkoolAIProfitLabEngine({ ledgerPath: tmpLedger });

// Test 1: Classify troubleshooting post
const p1 = {
  author: 'Dave_AI',
  title: 'Make.com webhook failed with timeout and rate limit',
  body: 'My agent loop is broken and getting 429 errors'
};
const c1 = engine.classifyPost(p1);
assert.equal(c1.category, 'TROUBLESHOOTING_PAIN');
assert.equal(c1.intentScore, 8);
assert.equal(c1.recommendedOffer.priceUsd, 499);
console.log('✔ Test 1: Troubleshooting post classified with $499 offer');

// Test 2: Classify direct hiring post
const p2 = {
  author: 'Sarah_Agency',
  title: 'Looking for a dev to build our custom AI agent system',
  body: 'We have budget and need someone to build turnkey pipelines'
};
const c2 = engine.classifyPost(p2);
assert.equal(c2.category, 'DIRECT_HIRING');
assert.equal(c2.intentScore, 10);
assert.equal(c2.recommendedOffer.priceUsd, 2500);
console.log('✔ Test 2: Hiring post classified with $2,500/mo retainer offer');

// Test 3: Generate response with Stripe link
const resp1 = engine.generateResponse(p1, c1);
assert.ok(resp1.includes('https://buy.stripe.com/5kQ00j3Ug6zcbO95e33sI3B'));
assert.ok(resp1.includes('@Dave_AI'));
console.log('✔ Test 3: Generated troubleshooting response contains valid $499 Stripe link');

// Test 4: Record engagement in ledger
const record = engine.recordEngagement('post_123', 'Dave_AI', resp1, c1);
assert.equal(record.postId, 'post_123');
assert.equal(engine.interactions.length, 1);
assert.ok(fs.existsSync(tmpLedger));
console.log('✔ Test 4: Engagement successfully recorded in persistent ledger');

// Clean up
try {
  if (fs.existsSync(tmpLedger)) fs.unlinkSync(tmpLedger);
} catch (e) {}

console.log('\nAll Skool AI Profit Lab Engine tests passed cleanly!');
