#!/usr/bin/env node
'use strict';

const assert = require('assert');
const { FirecrawlCreditGuard } = require('../tools/firecrawl-credit-guard');

console.log('=== Testing Firecrawl Credit & Billing Guard ===');

const guard = new FirecrawlCreditGuard();

// 1. Evaluate 50%+ Threshold Interdiction
const interdiction = guard.evaluateRequest('https://news.ycombinator.com', 'scrape');
assert.strictEqual(interdiction.allowFirecrawlApi, false);
assert.strictEqual(interdiction.recommendedAction, 'LOCAL_CHEERIO_SCRAPE');
assert.ok(interdiction.reason.includes('50.0%'));
console.log('✓ Firecrawl 50% credit threshold interdiction test passed');

// 2. Evaluate State Load & Save
const state = guard.loadState();
assert.strictEqual(typeof state.usedCredits, 'number');
console.log('✓ Firecrawl guard state load test passed');

console.log('✅ Firecrawl Credit & Billing Guard Unit Tests PASSED!');
